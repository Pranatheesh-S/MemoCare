import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { asyncHandler } from "../../middleware/errorHandler";
import { AppError } from "../../lib/errors";
import { env } from "../../config/env";
import { verifyMediaSignature } from "../../lib/signedUrl";

export const mediaRouter = Router();

const mediaRoot = path.resolve(process.cwd(), env.MEDIA_LOCAL_DIR);

/**
 * Serves a memory asset for a valid, unexpired signature.
 *
 * There is no unauthenticated path to media: the signature binds the key, the
 * patient and the expiry together, so a link cannot be reused for a different
 * patient or replayed after it lapses.
 */
mediaRouter.get(
  "/media/:key",
  asyncHandler(async (req, res) => {
    const key = decodeURIComponent(req.params.key);
    const patientId = String(req.query.patientId ?? "");
    const expires = Number(req.query.expires ?? 0);
    const signature = String(req.query.signature ?? "");

    const check = verifyMediaSignature(key, patientId, expires, signature);
    if (!check.valid) {
      throw check.reason === "EXPIRED"
        ? AppError.gone("This media link has expired. Please refresh and try again.")
        : AppError.forbidden("This media link is not valid");
    }

    const target = path.join(mediaRoot, key);
    if (!target.startsWith(mediaRoot)) throw AppError.badRequest("Invalid storage key");
    if (!fs.existsSync(target)) {
      // Missing media must never crash a client — a clean 404 lets the patient
      // app show its friendly "not on the device yet" state.
      throw AppError.notFound("Media");
    }

    res.setHeader("Cache-Control", "private, max-age=3600");
    res.sendFile(target);
  }),
);
