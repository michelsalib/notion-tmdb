# syntax=docker/dockerfile:1.7

# Single builder stage: install all deps (including dev), build the frontend,
# then re-install with --production to strip dev deps before copying into the
# slim runner.
FROM oven/bun:1 AS builder
WORKDIR /app

# Manifests first for layer caching.
COPY package.json bun.lock ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN bun install --frozen-lockfile

# Source
COPY tsconfig.json ./
COPY backend ./backend
COPY frontend ./frontend

# Build the SPA into frontend/dist
RUN cd frontend && bun run build

# Drop dev deps for the runtime image.
RUN rm -rf node_modules \
  && bun install --frozen-lockfile --production


FROM oven/bun:1-slim AS runner
WORKDIR /app

# Manifests + tsconfig (Bun resolves workspaces and tsconfig at runtime).
COPY --from=builder /app/package.json /app/bun.lock /app/tsconfig.json ./
COPY --from=builder /app/backend/package.json ./backend/
# Source (Bun runs TS natively).
COPY --from=builder /app/backend ./backend
# Pre-built SPA (Elysia static plugin serves from here).
COPY --from=builder /app/frontend/dist ./frontend/dist
# Production node_modules.
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production
ENV PORT=8080

# Default CMD = HTTP service. Cloud Run Job overrides this with
# `bun backend/job.ts` (or via Terraform `command`/`args`).
CMD ["bun", "backend/index.ts"]
