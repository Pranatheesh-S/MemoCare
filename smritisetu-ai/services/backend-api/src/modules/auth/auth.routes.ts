import { Router } from "express";
import {
  loginSchema,
  logoutSchema,
  pairDeviceSchema,
  refreshSchema,
  registerSchema,
} from "@smritisetu/shared-types";
import { validate } from "../../middleware/validate";
import { asyncHandler } from "../../middleware/errorHandler";
import { requireUser } from "../../middleware/auth";
import { authLimiter } from "../../middleware/rateLimit";
import { loginUser, logout, pairDevice, refreshSession, registerUser } from "./auth.service";

export const authRouter = Router();

authRouter.post(
  "/auth/register",
  authLimiter,
  validate(registerSchema),
  asyncHandler(async (req, res) => {
    const result = await registerUser(req.body, req);
    res.status(201).json({ data: result, requestId: req.requestId });
  }),
);

authRouter.post(
  "/auth/login",
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const result = await loginUser(req.body, req);
    res.json({ data: result, requestId: req.requestId });
  }),
);

authRouter.post(
  "/auth/refresh",
  authLimiter,
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const result = await refreshSession(req.body.refreshToken, req);
    res.json({ data: result, requestId: req.requestId });
  }),
);

authRouter.post(
  "/auth/logout",
  requireUser,
  validate(logoutSchema),
  asyncHandler(async (req, res) => {
    const result = await logout(req.auth!.userId, req.body, req);
    res.json({ data: result, requestId: req.requestId });
  }),
);

authRouter.post(
  "/devices/pair",
  authLimiter,
  validate(pairDeviceSchema),
  asyncHandler(async (req, res) => {
    const result = await pairDevice(req.body, req);
    res.status(201).json({ data: result, requestId: req.requestId });
  }),
);
