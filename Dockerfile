# ─── Build stage ──────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Postgres is the only data layer now, so no native build toolchain is needed.
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
    AUTO_MIGRATE=0

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev 2>&1 && rm -rf /root/.npm /root/.cache

# Built output plus what the runtime needs to read at start-up: SQL migrations
# (only used by the migrate job) and the bundled seed portraits in private/.
COPY --from=builder /app/next.config.ts .
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/private ./private
COPY --from=builder /app/src ./src
COPY --from=builder /app/db ./db
COPY --from=builder /app/scripts ./scripts

EXPOSE 3000

CMD ["node", "node_modules/next/dist/bin/next", "start", "-p", "3000"]
