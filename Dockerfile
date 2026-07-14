# syntax=docker/dockerfile:1
FROM node:22-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# --- deps: install from lockfile (fetches correct native binaries in-image) ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# --- builder: produce the standalone server ---
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# --- migrator: full deps + source + drizzle/ for the one-off migrate + seed step
# (the standalone runner is pruned and can't run tsx). Command set in compose.
FROM base AS migrator
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# --- runner: minimal self-contained image ---
FROM base AS runner
ENV NODE_ENV=production PORT=3000
COPY --from=builder /app/public ./public
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
