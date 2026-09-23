import { Router } from "express";
import { syncBatchSchema } from "@smritisetu/shared-types";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireDevice, requireUserOrDevice } from "../../middleware/auth";
import { syncLimiter } from "../../middleware/rateLimit";
import { AppError } from "../../lib/errors";
import { writeAudit } from "../../lib/audit";
import { getSyncStatus, ingestEvents } from "./sync.service";
import { isAssigned } from "../../middleware/patientAccess";

export const syncRouter = Router();

syncRouter.post(
  "/sync/events",
  syncLimiter,
  requireDevice,
  validate(syncBatchSchema),
  asyncHandler(async (req, res) => {
    const { deviceId, patientId } = req.device!;
    const result = await ingestEvents(deviceId, patientId, req.body);
    await writeAudit(req, {
      action: "SYNC_BATCH_INGESTED",
      resource: "SyncEvent",
      patientId,
      metadata: {
        accepted: result.accepted.length,
        duplicates: result.duplicates.length,
        rejected: result.rejected.length,
        conflicts: result.conflicts.length,
      },
    });
    res.json({ data: result, requestId: req.requestId });
  }),
);

syncRouter.get(
  "/sync/status/:deviceId",
  requireUserOrDevice,
  asyncHandler(async (req, res) => {
    const { deviceId } = req.params;
    const status = await getSyncStatus(deviceId);
    if (!status) throw AppError.notFound("Device");

    if (req.device && req.device.deviceId !== deviceId) {
      throw AppError.forbidden("A device may only read its own sync status");
    }
    if (req.auth && !(await isAssigned(req.auth.userId, req.auth.role, status.patientId))) {
      throw AppError.forbidden("You are not assigned to this patient");
    }

    res.json({ data: status, requestId: req.requestId });
  }),
);
