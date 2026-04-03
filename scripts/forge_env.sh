#!/bin/bash
# forge_env.sh — Variables d'environnement partagées pour tous les scripts agents.
# Source ce fichier : source /media/GitHub/Forge/scripts/forge_env.sh

# ── Chemin du repo Forge ─────────────────────────────────────────────────────
# Détecter le bon path selon l'environnement (host vs Docker)
if [ -d "/media/GitHub/Forge" ]; then
  FORGE_REPO="/media/GitHub/Forge"
elif [ -d "/mnt/GitHub/Forge" ]; then
  FORGE_REPO="/mnt/GitHub/Forge"
else
  FORGE_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

REPOS_ROOT="$(dirname "$FORGE_REPO")"

# ── URL du dashboard Forge ────────────────────────────────────────────────────
# Détecter si on tourne dans Docker (forge-host disponible) ou sur le host
if curl -s --max-time 1 "http://forge-host:4321/api/forge-hook" > /dev/null 2>&1; then
  FORGE_API="http://forge-host:4321/api"
elif curl -s --max-time 1 "http://127.0.0.1:4321/api/forge-hook" > /dev/null 2>&1; then
  FORGE_API="http://127.0.0.1:4321/api"
else
  # Fallback : utiliser la variable d'env si définie
  FORGE_API="${FORGE_API_URL:-http://127.0.0.1:4321/api}"
fi

export FORGE_REPO REPOS_ROOT FORGE_API

# ── Gateway OpenClaw (API, port par défaut dans openclaw.json) ───────────────
# Depuis un conteneur Forge : surcharger ex. http://172.17.0.1:18789 ou le nom du service.
OPENCLAW_GATEWAY_URL="${OPENCLAW_GATEWAY_URL:-http://127.0.0.1:18789}"
export OPENCLAW_GATEWAY_URL

# ── Fonction de reporting universelle ────────────────────────────────────────
forge_hook() {
  local agent="$1" type="$2" title="$3" content="$4" priority="${5:-medium}" project="${6:-}"
  local project_field=""
  [ -n "$project" ] && project_field=", \"project\": \"$project\""
  curl -s -X POST "$FORGE_API/forge-hook" \
    -H "Content-Type: application/json" \
    -d "{
      \"agentId\": \"$agent\",
      \"type\": \"$type\",
      \"title\": \"$(echo "$title" | sed 's/"/\\"/g')\",
      \"content\": \"$(echo "$content" | sed 's/"/\\"/g' | head -c 500)\",
      \"priority\": \"$priority\"
      $project_field
    }" > /dev/null 2>&1
}

export -f forge_hook
