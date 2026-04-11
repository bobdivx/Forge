FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm install --ignore-scripts --no-fund --no-audit

FROM node:22-alpine AS builder
WORKDIR /app
ENV ASTRO_DATABASE_FILE=file:/app/.astro/content.db
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p /app/.astro
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4321
ENV ASTRO_DATABASE_FILE=file:/app/.astro/content.db

# Git est requis pour execFileSync('git', …) (historique / résumé dépôt côté serveur).
RUN apk add --no-cache git

COPY package.json package-lock.json .npmrc ./
RUN npm install --omit=dev --ignore-scripts --no-fund --no-audit

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/db ./db

EXPOSE 4321
CMD ["node", "dist/server/entry.mjs"]
