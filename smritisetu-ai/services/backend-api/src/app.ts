import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env";
import { requestId } from "./middleware/requestId";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";
import { apiLimiter } from "./middleware/rateLimit";
import { authRouter } from "./modules/auth/auth.routes";
import { patientsRouter } from "./modules/patients/patients.routes";
import { schedulesRouter } from "./modules/schedules/schedules.routes";
import { syncRouter } from "./modules/sync/sync.routes";
import { gamesRouter } from "./modules/games/games.routes";
import { memoriesRouter } from "./modules/memories/memories.routes";
import { alertsRouter } from "./modules/alerts/alerts.routes";
import { mediaRouter } from "./modules/media/media.routes";
import { healthRouter } from "./modules/health/health.routes";
import { openApiDocument } from "./docs/openapi";

export function createApp(): Express {
  const app = express();

  app.set("trust proxy", 1);

  app.use(
    helmet({
      // Swagger UI needs inline styles; everything else stays locked down.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          mediaSrc: ["'self'", "blob:"],
        },
      },
      crossOriginResourcePolicy: { policy: "cross-origin" },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        // Mobile apps and server-to-server calls send no Origin header.
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes(origin) || env.corsOrigins.includes("*")) {
          return callback(null, true);
        }
        callback(new Error(`Origin ${origin} is not allowed by CORS policy`));
      },
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "x-request-id", "x-correlation-id"],
      exposedHeaders: ["x-request-id"],
    }),
  );

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));
  app.use(requestId);

  // Health probes must stay outside the rate limiter.
  app.use("/", healthRouter);

  app.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: "SmritiSetu AI — API",
      swaggerOptions: { persistAuthorization: true },
    }),
  );
  app.get("/openapi.json", (_req, res) => res.json(openApiDocument));

  const api = express.Router();
  api.use(apiLimiter);
  api.use(authRouter);
  api.use(patientsRouter);
  api.use(schedulesRouter);
  api.use(syncRouter);
  api.use(gamesRouter);
  api.use(memoriesRouter);
  api.use(alertsRouter);
  api.use(mediaRouter);
  app.use(env.API_BASE_PATH, api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
