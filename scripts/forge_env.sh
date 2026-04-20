#!/usr/bin/env bash
# forge_env.sh — Base URL Forge pour hooks et API agents (sources pour shell / OpenClaw).
#
# Définissez avant d'inclure ce fichier (optionnel) :
#   export FORGE_HOOK_BASE_URL=http://forge-host:4321
#
# Détection automatique si vide :
#   • FORGE_HOOK_BASE_URL (priorité — même convention que Forge audit-launch et .env serveur)
#   • PUBLIC_FORGE_URL puis PUBLIC_SITE_URL (secours Astro)
#   • Si la commande tourne dans un conteneur avec extra_hosts forge-host → http://forge-host:4321
#   • Sinon → http://127.0.0.1:4321 (Forge sur la même machine que le shell)

if [ -n "${FORGE_HOOK_BASE_URL:-}" ]; then
  export FORGE_BASE_URL="${FORGE_HOOK_BASE_URL%/}"
elif [ -n "${PUBLIC_FORGE_URL:-}" ]; then
  export FORGE_BASE_URL="${PUBLIC_FORGE_URL%/}"
elif [ -n "${PUBLIC_SITE_URL:-}" ]; then
  export FORGE_BASE_URL="${PUBLIC_SITE_URL%/}"
elif [ -f /.dockerenv ] && getent hosts forge-host >/dev/null 2>&1; then
  export FORGE_BASE_URL="http://forge-host:4321"
else
  export FORGE_BASE_URL="http://127.0.0.1:4321"
fi

export FORGE_HOOK_URL="${FORGE_BASE_URL}/api/forge-hook"
export FORGE_API_URL="${FORGE_BASE_URL}/api"
