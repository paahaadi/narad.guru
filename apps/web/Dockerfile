FROM node:22-alpine AS deps
WORKDIR /app/apps/web

COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app

COPY . .
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
RUN cd apps/web && npm run build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# standalone output is at apps/web/.next/standalone
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000

CMD ["node", "apps/web/server.js"]
