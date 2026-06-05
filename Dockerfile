# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# ── Stage 2: builder ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 3: runner ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs \
    && adduser  --system --uid 1001 nextjs

# Production node_modules from stage 1
COPY --from=deps    /app/node_modules ./node_modules
# Built Next.js output
COPY --from=builder /app/.next        ./.next
# Runtime files
COPY --from=builder /app/public       ./public
COPY --from=builder /app/server.js    ./server.js
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/package.json  ./package.json

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]