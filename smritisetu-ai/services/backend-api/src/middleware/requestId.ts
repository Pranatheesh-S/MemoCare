import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

export function requestId(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.get("x-request-id");
  req.requestId = incoming && incoming.length <= 64 ? incoming : crypto.randomUUID();
  res.setHeader("x-request-id", req.requestId);
  next();
}
