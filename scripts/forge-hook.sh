#!/usr/bin/env bash
# forge-hook.sh — POST vers /api/forge-hook avec JSON sûr (pas d'échappement bash fragile).
#
# Usage :
#   forge-hook.sh <agentId> <type> <title> <content> [extra-json]
#
# extra-json : objet JSON fusionné dans le corps (ex. '{"project":"MonRepo","priority":"high"}')
#
# Mode stdin (corps JSON complet, une ligne ou fichier via process substitution) :
#   forge-hook.sh --stdin < fichier.json
#
# Variables : source scripts/forge_env.sh avant ce script, ou exportez FORGE_HOOK_BASE_URL.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/forge_env.sh"

die() {
  echo "forge-hook: $*" >&2
  exit 1
}

build_body() {
  python3 - "$@" <<'PY'
import json, sys

args = sys.argv[1:]
if len(args) < 4:
    sys.stderr.write("usage: agentId type title content [extra-json]\n")
    sys.exit(2)

agent_id, hook_type, title, content = args[:4]
extra = {}
if len(args) > 4 and args[4].strip():
    extra = json.loads(args[4])

body = {
    "agentId": agent_id,
    "type": hook_type,
    "title": title,
    "content": content,
    **extra,
}
print(json.dumps(body, ensure_ascii=False))
PY
}

if [ "${1:-}" = "--stdin" ]; then
  BODY=$(cat)
  [ -n "$BODY" ] || die "corps JSON vide"
else
  [ "${1:-}" ] && [ "${2:-}" ] && [ "${3:-}" ] && [ "${4:-}" ] || die "usage: $0 <agentId> <type> <title> <content> [extra-json] | --stdin"
  BODY="$(build_body "$1" "$2" "$3" "$4" "${5:-}")"
fi

RESPONSE_FILE=$(mktemp)
HTTP_CODE=$(curl -sS -o "$RESPONSE_FILE" -w "%{http_code}" \
  -X POST "$FORGE_HOOK_URL" \
  -H "Content-Type: application/json; charset=utf-8" \
  "${FORGE_AUTH_CURL_ARGS[@]}" \
  --data-binary "$BODY") || die "curl a échoué"

cat "$RESPONSE_FILE"
rm -f "$RESPONSE_FILE"

if [ "$HTTP_CODE" != "200" ]; then
  echo "forge-hook: HTTP $HTTP_CODE (URL=$FORGE_HOOK_URL)" >&2
  exit 1
fi
