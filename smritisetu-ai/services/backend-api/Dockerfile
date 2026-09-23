# Built from the repository root so the shared-types workspace is available:
#   docker build -f services/backend-api/Dockerfile .
FROM node:22-alpine AS builder

WORKDIR /app

# Manifests first, so a code change does not invalidate the dependency layer.
COPY package.json package-lock.json* ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY services/backend-api/package.json ./services/backend-api/

RUN npm install --workspace @smritisetu/shared-types --workspace @smritisetu/backend-api --include-workspace-root

COPY packages/shared-types ./packages/shared-types
COPY services/backend-api ./services/backend-api

RUN npm run build -w @smritisetu/shared-types \
 && npx prisma generate --schema services/backend-api/prisma/schema.prisma \
 && npm run build -w @smritisetu/backend-api

# ---------------------------------------------------------------------------

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production

RUN apk add --no-cache openssl \
 && addgroup -S smritisetu && adduser -S smritisetu -G smritisetu

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/services/backend-api/dist ./dist
COPY --from=builder /app/services/backend-api/prisma ./prisma
COPY --from=builder /app/services/backend-api/package.json ./package.json

# Seeded placeholder media, so a fresh container can serve the demo assets.
COPY --from=builder /app/services/backend-api/storage ./storage

RUN mkdir -p /app/storage/media && chown -R smritisetu:smritisetu /app/storage
USER smritisetu

EXPOSE 4000

HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD wget -qO- http://localhost:4000/health || exit 1

CMD ["node", "dist/src/server.js"]
