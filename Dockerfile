# ─── Build stage ──────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Install native deps (better-sqlite3 needs build tools)
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci 2>&1

COPY . .
RUN npm run build 2>&1

# ─── Runtime stage ────────────────────────────────────────────────────
FROM node:20-alpine AS runner

# AUTH_MODE is deliberately unset: dev auth must never ship. Configure
# Supabase credentials (or set a signed dev session only on your own machine).
ENV NODE_ENV=production \
    PORT=3000 \
    SQLITE_PATH=/data/choretle.db

WORKDIR /app

# Install production deps only (no dev deps)
COPY package.json package-lock.json ./
RUN apk add --no-cache python3 make g++ \
    && npm install --production 2>&1 \
    && rm -rf /root/.npm /root/.node-gyp /root/.cache \
    && apk del python3 make g++

# Copy built output from builder
COPY --from=builder /app/next.config.ts .
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/src ./src

EXPOSE 3000

CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
