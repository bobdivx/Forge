FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY scripts/ ./scripts/
RUN npm install --no-fund --no-audit --force

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
# CLI Docker : sonde ZimaOS (docker inspect / exec) via /var/run/docker.sock monté par le compose NAS.
# GitHub CLI : outils agent github_* (PR, issues, gist…) — auth via $GITHUB_TOKEN par appel.
# bash : requis par certains outils exec_template qui utilisent set -e / pipes complexes.
RUN apk add --no-cache git docker-cli github-cli bash

COPY package.json package-lock.json .npmrc ./
COPY scripts/ ./scripts/
RUN npm install --omit=dev --no-fund --no-audit --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/db ./db

EXPOSE 4321

# Au démarrage : applique CREATE TABLE IF NOT EXISTS (nouvelles tables ajoutées au schema)
# + ALTER TABLE ADD COLUMN IF NOT EXISTS (nouvelles colonnes sur tables existantes).
# Idempotent : aucune perte de données. Si la sync échoue, on log et on démarre quand même
# (pour éviter un crash-loop si la sync est cassée — la prod redémarre et reste accessible).
CMD ["sh", "-c", "node scripts/forge-sync-local-db.mjs \"$ASTRO_DATABASE_FILE\" || echo '[forge] WARN sync-local-db failed, continuing anyway'; exec node dist/server/entry.mjs"]
