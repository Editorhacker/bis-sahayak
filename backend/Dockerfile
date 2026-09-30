# ─────────────────────────────────────────────────────────────────
# BIS SAHAYAK – TypeScript Express Backend
# ─────────────────────────────────────────────────────────────────
# Multi-stage build: compile TS → ship only compiled JS

# ── Stage 1: build ───────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Native deps needed by argon2
RUN apk add --no-cache python3 make g++

COPY package*.json ./
# Install ALL deps (including devDeps needed for tsc)
RUN npm ci

COPY tsconfig.json ./
COPY server ./server

RUN npm run build


# ── Stage 2: runtime ────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++ \
    && addgroup -S appgroup \
    && adduser  -S appuser -G appgroup

COPY package*.json ./
# Production deps only
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "dist/server.js"]