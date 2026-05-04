#!/usr/bin/env bash
# forge_env.sh — Base URL Forge pour hooks et API agents (sources pour shell / ZimaOS).
#
# Définissez avant d'inclure ce fichier (optionnel) :
#   export FORGE_HOOK_BASE_URL=http://forge-host:4331  # Forge en conteneur NAS (`4331 -> 4321`)
#   export FORGE_API_TOKEN=forge_xxx   # ou FORGE_AGENT_TOKEN
#
# Si vide : lecture de **forgePublicUrl** renseigné dans Paramètres → Connexion ZimaOS
# (GET /api/agent-api-secrets, joignable depuis cette machine — souvent http://127.0.0.1:4321 sur l’hôte).
# Surcharge : FORGE_AGENT_SECRETS_ENDPOINT=https://…/api/agent-api-secrets
#
# Détection automatique ensuite :
#   • FORGE_HOOK_BASE_URL (priorité — même convention que Forge audit-launch et .env serveur)
#   • PUBLIC_FORGE_URL puis PUBLIC_SITE_URL (secours Astro)
#   • Si la commande tourne dans un conteneur avec extra_hosts forge-host → auto-probe 4321/4331
#   • Sinon → http://127.0.0.1:4321 (Forge sur la même machine que le shell)


_FORGE_AUTH_TOKEN="${FORGE_API_TOKEN:-${FORGE_AGENT_TOKEN:-}}"

# 1. Tenter de lire directement depuis la base SQLite si accessible (cas Ageton complet)
_DB_PATH="$(dirname "${BASH_SOURCE[0]}")/../.astro/content.db"
if [ -z "${FORGE_HOOK_BASE_URL:-}" ] && [ -f "$_DB_PATH" ] && command -v python3 >/dev/null 2>&1; then
  _FP="$(python3 -c "import sqlite3; db=sqlite3.connect('$_DB_PATH'); row=db.execute('SELECT value FROM Config WHERE key=\"forgePublicUrl\"').fetchone(); print(row[0] if row else '')" 2>/dev/null || true)"
  if [ -n "${_FP:-}" ]; then
    export FORGE_HOOK_BASE_URL="$_FP"
  fi
  if [ -z "${_FORGE_AUTH_TOKEN:-}" ]; then
    _FT="$(python3 -c "import sqlite3; db=sqlite3.connect('$_DB_PATH'); row=db.execute('SELECT value FROM Config WHERE key=\"forgeApiToken\"').fetchone(); print(row[0] if row else '')" 2>/dev/null || true)"
    if [ -n "${_FT:-}" ]; then
      _FORGE_AUTH_TOKEN="$_FT"
    fi
  fi
fi

if [ -n "${_FORGE_AUTH_TOKEN:-}" ]; then
  export FORGE_AUTH_HEADER="Authorization: Bearer ${_FORGE_AUTH_TOKEN}"
  export FORGE_AUTH_CURL_ARGS=(-H "$FORGE_AUTH_HEADER")
else
  export FORGE_AUTH_HEADER=""
  export FORGE_AUTH_CURL_ARGS=()
fi

if [ -z "${FORGE_HOOK_BASE_URL:-}" ] && [ -z "${PUBLIC_FORGE_URL:-}" ] && [ -z "${PUBLIC_SITE_URL:-}" ]; then
  _EP="${FORGE_AGENT_SECRETS_ENDPOINT:-http://127.0.0.1:4321/api/config/secrets}"
  if command -v curl >/dev/null 2>&1 && command -v python3 >/dev/null 2>&1; then
    _FP="$(curl -sf "${FORGE_AUTH_CURL_ARGS[@]}" "$_EP" 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print((d.get('forgePublicUrl') or '').strip())" 2>/dev/null || true)"
    if [ -n "${_FP:-}" ]; then
      export FORGE_HOOK_BASE_URL="$_FP"
    fi
  fi
fi

if [ -n "${FORGE_HOOK_BASE_URL:-}" ]; then
  export FORGE_BASE_URL="${FORGE_HOOK_BASE_URL%/}"
elif [ -n "${PUBLIC_FORGE_URL:-}" ]; then
  export FORGE_BASE_URL="${PUBLIC_FORGE_URL%/}"
elif [ -n "${PUBLIC_SITE_URL:-}" ]; then
  export FORGE_BASE_URL="${PUBLIC_SITE_URL%/}"
elif [ -f /.dockerenv ] && getent hosts forge-host >/dev/null 2>&1; then
  _FORGE_HOST_PORT="${FORGE_HOST_PORT:-}"
  if [ -n "$_FORGE_HOST_PORT" ]; then
    export FORGE_BASE_URL="http://forge-host:${_FORGE_HOST_PORT}"
  elif command -v curl >/dev/null 2>&1 && curl -sf --max-time 1 "http://forge-host:4321/login" >/dev/null 2>&1; then
    export FORGE_BASE_URL="http://forge-host:4321"
  elif command -v curl >/dev/null 2>&1 && curl -sf --max-time 1 "http://forge-host:4331/login" >/dev/null 2>&1; then
    export FORGE_BASE_URL="http://forge-host:4331"
  else
    # Forge en conteneur NAS publie typiquement 4331 -> 4321 ; gardez FORGE_HOST_PORT pour surcharger.
    export FORGE_BASE_URL="http://forge-host:4331"
  fi
elif [ -f /.dockerenv ]; then
  # Dans un conteneur CasaOS typique (ZimaOS), l'hôte (où tourne Forge Prod sur le port 4331) est 172.17.0.1
  export FORGE_BASE_URL="http://172.17.0.1:4331"
else
  export FORGE_BASE_URL="http://127.0.0.1:4321"
fi
export FORGE_HOOK_URL="${FORGE_BASE_URL}/api/forge-hook"
export FORGE_API_URL="${FORGE_BASE_URL}/api"
