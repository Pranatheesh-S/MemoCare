import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";
import { AppError } from "../lib/errors";

type Source = "body" | "query" | "params";

/**
 * Validates and, importantly, *replaces* the request segment with the parsed
 * result so downstream handlers work with coerced, defaulted values only.
 */
export function validate(schema: ZodTypeAny, source: Source = "body") {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      next(
        AppError.validation(
          "The request did not pass validation",
          result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        ),
      );
      return;
    }
    if (source === "query") {
      // req.query is a getter in Express 5-style setups; assign defensively.
      Object.defineProperty(req, "query", { value: result.data, writable: true, configurable: true });
    } else {
      req[source] = result.data as never;
    }
    next();
  };
}
