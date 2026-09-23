import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { AppError } from "../lib/errors";
import { logger } from "../lib/logger";

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `No route matches ${req.method} ${req.path}`,
      requestId: req.requestId,
    },
  });
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
): void {
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        requestId: req.requestId,
      },
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "The request body did not pass validation",
        details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        requestId: req.requestId,
      },
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      res.status(409).json({
        error: {
          code: "DUPLICATE",
          message: "That record already exists",
          details: { target: error.meta?.target },
          requestId: req.requestId,
        },
      });
      return;
    }
    if (error.code === "P2025") {
      res.status(404).json({
        error: { code: "NOT_FOUND", message: "Resource was not found", requestId: req.requestId },
      });
      return;
    }
  }

  logger.error("Unhandled error", {
    requestId: req.requestId,
    path: req.path,
    method: req.method,
    reason: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  res.status(500).json({
    error: {
      code: "INTERNAL_ERROR",
      message: "Something went wrong on our side",
      requestId: req.requestId,
    },
  });
}

/** Wraps an async handler so rejected promises reach the error handler. */
export function asyncHandler<T extends (req: Request, res: Response, next: NextFunction) => Promise<unknown>>(
  handler: T,
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    handler(req, res, next).catch(next);
  };
}
