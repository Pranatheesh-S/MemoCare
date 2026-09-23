import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import multer from "multer";
import { consentSchema, createMemorySchema, uploadUrlSchema } from "@smritisetu/shared-types";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireRole, requireUser, requireUserOrDevice } from "../../middleware/auth";
import { requireAccessToPatientOf, requirePatientAccess } from "../../middleware/patientAccess";
import { prisma } from "../../lib/prisma";
import { AppError } from "../../lib/errors";
import { env } from "../../config/env";
import { buildSignedUrl, checksumOf, verifyMediaSignature } from "../../lib/signedUrl";
import { writeAudit } from "../../lib/audit";
import { bumpPackageVersion } from "../../services/offlinePackage";

export const memoriesRouter = Router();

const mediaRoot = path.resolve(process.cwd(), env.MEDIA_LOCAL_DIR);
fs.mkdirSync(mediaRoot, { recursive: true });

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "audio/mpeg",
  "audio/mp4",
  "audio/m4a",
  "audio/wav",
  "audio/aac",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MEDIA_MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      cb(new Error(`Unsupported media type: ${file.mimetype}`));
      return;
    }
    cb(null, true);
  },
});

const resolveMemoryPatient = async (req: import("express").Request) => {
  const memory = await prisma.memoryAsset.findFirst({
    where: { id: req.params.memoryId, deletedAt: null },
    select: { patientId: true },
  });
  return memory?.patientId ?? null;
};

/* -------------------------------------------------------------------------- */
/*  Consent                                                                   */
/* -------------------------------------------------------------------------- */

memoriesRouter.post(
  "/patients/:patientId/consents",
  requireUser,
  requireRole("CAREGIVER", "HEALTH_WORKER", "ADMIN"),
  requirePatientAccess(),
  validate(consentSchema),
  asyncHandler(async (req, res) => {
    const consent = await prisma.consentRecord.create({
      data: {
        patientId: req.params.patientId,
        purpose: req.body.purpose,
        grantedByUserId: req.auth!.userId,
        grantedByName: req.body.grantedByName,
        assetScope: req.body.assetScope,
        consentVersion: req.body.consentVersion,
      },
    });
    await writeAudit(req, {
      action: "CONSENT_GRANTED",
      resource: "ConsentRecord",
      resourceId: consent.id,
      patientId: req.params.patientId,
      metadata: { purpose: consent.purpose, scope: consent.assetScope },
    });
    res.status(201).json({ data: consent, requestId: req.requestId });
  }),
);

memoriesRouter.get(
  "/patients/:patientId/consents",
  requireUser,
  requirePatientAccess(),
  asyncHandler(async (req, res) => {
    const consents = await prisma.consentRecord.findMany({
      where: { patientId: req.params.patientId },
      orderBy: { grantedAt: "desc" },
    });
    res.json({ data: consents, requestId: req.requestId });
  }),
);

/**
 * Withdrawing consent immediately removes every asset in its scope from future
 * offline packages and soft-deletes the assets, while keeping the consent
 * record itself for audit.
 */
memoriesRouter.post(
  "/consents/:consentId/withdraw",
  requireUser,
  requireRole("CAREGIVER", "HEALTH_WORKER", "ADMIN"),
  requireAccessToPatientOf(async (req) => {
    const consent = await prisma.consentRecord.findUnique({
      where: { id: req.params.consentId },
      select: { patientId: true },
    });
    return consent?.patientId ?? null;
  }),
  asyncHandler(async (req, res) => {
    const consent = await prisma.consentRecord.findUnique({ where: { id: req.params.consentId } });
    if (!consent) throw AppError.notFound("Consent record");
    if (consent.status === "WITHDRAWN") {
      res.json({ data: { consentId: consent.id, alreadyWithdrawn: true }, requestId: req.requestId });
      return;
    }

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.consentRecord.update({
        where: { id: consent.id },
        data: {
          status: "WITHDRAWN",
          withdrawnAt: now,
          withdrawalNote: typeof req.body?.note === "string" ? req.body.note.slice(0, 500) : null,
        },
      });
      const affected = await tx.memoryAsset.updateMany({
        where: { consentId: consent.id, deletedAt: null },
        data: { deletedAt: now },
      });
      return { updated, affected: affected.count };
    });

    await bumpPackageVersion(consent.patientId);
    await writeAudit(req, {
      action: "CONSENT_WITHDRAWN",
      resource: "ConsentRecord",
      resourceId: consent.id,
      patientId: consent.patientId,
      metadata: { assetsRemoved: result.affected },
    });

    res.json({
      data: {
        consentId: consent.id,
        status: "WITHDRAWN",
        withdrawnAt: now.toISOString(),
        assetsRemoved: result.affected,
      },
      requestId: req.requestId,
    });
  }),
);

/* -------------------------------------------------------------------------- */
/*  Upload                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Issues a short-lived signed upload target.
 *
 * The prototype signs a local endpoint; swapping MEDIA_DRIVER to `s3` is the
 * only change needed to return a real S3 pre-signed PUT (see .env.example).
 */
memoriesRouter.post(
  "/patients/:patientId/memories/upload-url",
  requireUser,
  requireRole("CAREGIVER", "HEALTH_WORKER", "ADMIN"),
  requirePatientAccess(),
  validate(uploadUrlSchema),
  asyncHandler(async (req, res) => {
    if (req.body.sizeBytes > env.MEDIA_MAX_UPLOAD_BYTES) {
      throw AppError.badRequest(
        `File is larger than the ${Math.round(env.MEDIA_MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit`,
      );
    }
    const extension = path.extname(req.body.fileName).slice(0, 10) || guessExtension(req.body.mimeType);
    const key = `${req.params.patientId}/${Date.now()}-${cryptoRandom()}${extension}`;
    const signed = buildSignedUrl(key, req.params.patientId, `${req.protocol}://${req.get("host")}`, 900);

    res.status(201).json({
      data: {
        storageKey: key,
        uploadUrl: signed.replace("/media/", "/media-upload/"),
        method: "PUT",
        expiresInSeconds: 900,
        maxBytes: env.MEDIA_MAX_UPLOAD_BYTES,
        driver: env.MEDIA_DRIVER,
      },
      requestId: req.requestId,
    });
  }),
);

/** Receives the actual bytes for a signed upload target. */
memoriesRouter.put(
  "/media-upload/:key",
  requireUser,
  requireRole("CAREGIVER", "HEALTH_WORKER", "ADMIN"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    const key = decodeURIComponent(req.params.key);
    const patientId = String(req.query.patientId ?? "");
    const expires = Number(req.query.expires ?? 0);
    const signature = String(req.query.signature ?? "");

    const check = verifyMediaSignature(key, patientId, expires, signature);
    if (!check.valid) throw AppError.forbidden(`Upload link is not valid (${check.reason})`);

    const body: Buffer | undefined = req.file?.buffer ?? (Buffer.isBuffer(req.body) ? req.body : undefined);
    if (!body || body.length === 0) throw AppError.badRequest("No file content was received");
    if (body.length > env.MEDIA_MAX_UPLOAD_BYTES) throw AppError.badRequest("File is too large");

    const target = path.join(mediaRoot, key);
    // Guard against a crafted key escaping the media root.
    if (!target.startsWith(mediaRoot)) throw AppError.badRequest("Invalid storage key");
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);

    await writeAudit(req, {
      action: "MEDIA_UPLOADED",
      resource: "MemoryAsset",
      patientId,
      metadata: { storageKey: key, sizeBytes: body.length },
    });

    res.status(201).json({
      data: { storageKey: key, sizeBytes: body.length, checksum: checksumOf(body) },
      requestId: req.requestId,
    });
  }),
);

/* -------------------------------------------------------------------------- */
/*  Memory CRUD                                                               */
/* -------------------------------------------------------------------------- */

memoriesRouter.post(
  "/patients/:patientId/memories",
  requireUser,
  requireRole("CAREGIVER", "HEALTH_WORKER", "ADMIN"),
  requirePatientAccess(),
  validate(createMemorySchema),
  asyncHandler(async (req, res) => {
    const consent = await prisma.consentRecord.findFirst({
      where: { id: req.body.consentId, patientId: req.params.patientId },
    });
    if (!consent) throw AppError.badRequest("A valid consent record for this patient is required");
    if (consent.status !== "ACTIVE") {
      throw AppError.conflict("That consent record has been withdrawn and cannot cover new memories");
    }

    const memory = await prisma.memoryAsset.create({
      data: { ...req.body, patientId: req.params.patientId },
    });
    await bumpPackageVersion(req.params.patientId);
    await writeAudit(req, {
      action: "MEMORY_CREATED",
      resource: "MemoryAsset",
      resourceId: memory.id,
      patientId: req.params.patientId,
      metadata: { category: memory.category, assetType: memory.assetType },
    });

    res.status(201).json({ data: memory, requestId: req.requestId });
  }),
);

memoriesRouter.get(
  "/patients/:patientId/memories",
  requireUserOrDevice,
  requirePatientAccess(),
  asyncHandler(async (req, res) => {
    const category = typeof req.query.category === "string" ? req.query.category : undefined;
    const memories = await prisma.memoryAsset.findMany({
      where: {
        patientId: req.params.patientId,
        deletedAt: null,
        consent: { status: "ACTIVE" },
        ...(category ? { category: category as never } : {}),
      },
      orderBy: { createdAt: "desc" },
    });

    const baseUrl = `${req.protocol}://${req.get("host")}`;
    res.json({
      data: memories.map((m) => ({
        ...m,
        // Never a public URL — always a short-lived signed link.
        mediaUrl: m.storageKey ? buildSignedUrl(m.storageKey, m.patientId, baseUrl) : null,
        voiceUrl: m.voiceStorageKey ? buildSignedUrl(m.voiceStorageKey, m.patientId, baseUrl) : null,
      })),
      requestId: req.requestId,
    });
  }),
);

memoriesRouter.delete(
  "/memories/:memoryId",
  requireUser,
  requireRole("CAREGIVER", "HEALTH_WORKER", "ADMIN"),
  requireAccessToPatientOf(resolveMemoryPatient),
  asyncHandler(async (req, res) => {
    const memory = await prisma.memoryAsset.findFirst({
      where: { id: req.params.memoryId, deletedAt: null },
    });
    if (!memory) throw AppError.notFound("Memory");

    await prisma.memoryAsset.update({
      where: { id: memory.id },
      data: { deletedAt: new Date() },
    });
    await bumpPackageVersion(memory.patientId);
    await writeAudit(req, {
      action: "MEMORY_DELETED",
      resource: "MemoryAsset",
      resourceId: memory.id,
      patientId: memory.patientId,
    });

    res.json({ data: { memoryId: memory.id, deleted: true }, requestId: req.requestId });
  }),
);

/** Patient-facing favourite toggle. */
memoriesRouter.post(
  "/memories/:memoryId/favourite",
  requireUserOrDevice,
  requireAccessToPatientOf(resolveMemoryPatient),
  asyncHandler(async (req, res) => {
    const memory = await prisma.memoryAsset.findFirst({
      where: { id: req.params.memoryId, deletedAt: null },
    });
    if (!memory) throw AppError.notFound("Memory");
    const updated = await prisma.memoryAsset.update({
      where: { id: memory.id },
      data: { favourite: !memory.favourite },
    });
    res.json({ data: { memoryId: updated.id, favourite: updated.favourite }, requestId: req.requestId });
  }),
);

function guessExtension(mimeType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "audio/mpeg": ".mp3",
    "audio/mp4": ".m4a",
    "audio/m4a": ".m4a",
    "audio/wav": ".wav",
    "audio/aac": ".aac",
  };
  return map[mimeType] ?? ".bin";
}

function cryptoRandom(): string {
  return Math.random().toString(36).slice(2, 10);
}
