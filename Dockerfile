FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --ignore-scripts --no-fund --no-audit

FROM node:20-alpine AS builder
WORKDIR /app
ENV ASTRO_DATABASE_FILE=/app/.astro/db.sqlite
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /app/.astro
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
ENV ASTRO_DATABASE_FILE=/app/.astro/db.sqlite

COPY package.json package-lock.json ./
RUN npm install --omit=dev --ignore-scripts --no-fund --no-audit

COPY --from=builder /app/dist ./dist

EXPOSE 4321
CMD ["node", "dist/server/entry.mjs"]
