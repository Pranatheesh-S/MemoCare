import rateLimit from "express-rate-limit";
import { env } from "../config/env";

const shared = {
  standardHeaders: true,
  legacyHeaders: false,
  // Tests would otherwise trip the limiter across cases.
  skip: () => env.isTest,
  handler: (req: import("express").Request, res: import("express").Response) => {
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests. Please try again shortly.",
        requestId: req.requestId,
      },
    });
  },
};

export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  ...shared,
});

/** Tighter budget on credential and pairing endpoints. */
export const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  ...shared,
});

/** Sync batches are large but infrequent; give devices room to catch up. */
export const syncLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  ...shared,
});
