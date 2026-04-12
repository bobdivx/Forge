#!/bin/bash
# configure_openclaw_default_agent.sh
#
# Configure acp.defaultAgent dans les settings OpenClaw.
# À exécuter sur le ZimaCube (ou via docker exec).
#
# Usage:
#   ./configure_openclaw_default_agent.sh [agentId]
#   ./configure_openclaw_default_agent.sh DEV_FRONTEND   (défaut si omis)

set -euo pipefail

DEFAULT_AGENT="${1:-DEV_FRONTEND}"
OPENCLAW_DATA="${OPENCLAW_DATA:-/DATA/AppData/openclaw}"

# ── Validation ─────────────────────────────────────────────────────────────────
VALID_AGENTS=(
  DEV_FRONTEND DEV_BACKEND ARCHITECTE_LOGICIEL ANALYSTE_CODE
  EXPERT_GITHUB REDACTEUR_DOC TESTEUR_QA INFRA_TECH VEILLE_TECH
  INGENIEUR_HARDWARE MAINTENANCE_REPO SCRIPTEUR_AUTOMATE
  INGENIEUR_PROMPT SECURITE_CODE
)

FOUND=0
for a in "${VALID_AGENTS[@]}"; do
  [[ "$DEFAULT_AGENT" == "$a" ]] && FOUND=1 && break
done

if [[ $FOUND -eq 0 ]]; then
  echo "❌  Agent '$DEFAULT_AGENT' non reconnu."
  echo "    Agents valides : ${VALID_AGENTS[*]}"
  exit 1
fi

echo "→ Agent par défaut cible : $DEFAULT_AGENT"
echo "→ Répertoire OpenClaw    : $OPENCLAW_DATA"

# ── Recherche du fichier settings ──────────────────────────────────────────────
# Tenter d'abord les emplacements connus, puis chercher plus largement.
SETTINGS_CANDIDATES=(
  "$OPENCLAW_DATA/settings.json"
  "$OPENCLAW_DATA/config/settings.json"
  "$OPENCLAW_DATA/agents/main/agent/settings.json"
  "$OPENCLAW_DATA/workspace/settings.json"
)

SETTINGS_FILE=""
for f in "${SETTINGS_CANDIDATES[@]}"; do
  if [[ -f "$f" ]]; then
    SETTINGS_FILE="$f"
    echo "✓  Fichier settings trouvé : $f"
    break
  fi
done

# Fallback : chercher le premier settings.json dans l'arbo OpenClaw
if [[ -z "$SETTINGS_FILE" ]]; then
  SETTINGS_FILE=$(find "$OPENCLAW_DATA" -name "settings.json" -maxdepth 5 2>/dev/null | head -n 1 || true)
  if [[ -n "$SETTINGS_FILE" ]]; then
    echo "✓  settings.json localisé par recherche : $SETTINGS_FILE"
  fi
fi

# ── Mise à jour ou création du fichier ────────────────────────────────────────
if [[ -n "$SETTINGS_FILE" ]]; then
  # Sauvegarder avant modification
  cp "$SETTINGS_FILE" "${SETTINGS_FILE}.bak"
  echo "  (backup → ${SETTINGS_FILE}.bak)"

  # Vérifier si jq est disponible pour une modification propre
  if command -v jq &>/dev/null; then
    TMP=$(mktemp)
    jq --arg agent "$DEFAULT_AGENT" '.acp.defaultAgent = $agent' "$SETTINGS_FILE" > "$TMP"
    mv "$TMP" "$SETTINGS_FILE"
    echo "✓  acp.defaultAgent = \"$DEFAULT_AGENT\" écrit (via jq)"
  else
    # Fallback : sed/remplacement basique
    if grep -q '"acp"' "$SETTINGS_FILE" 2>/dev/null; then
      sed -i "s|\"defaultAgent\":[[:space:]]*\"[^\"]*\"|\"defaultAgent\": \"$DEFAULT_AGENT\"|g" "$SETTINGS_FILE"
      echo "✓  acp.defaultAgent mis à jour (via sed)"
    else
      # Injecter le bloc acp avant la dernière accolade
      sed -i "s|}[[:space:]]*$|  ,\"acp\":{\"defaultAgent\":\"$DEFAULT_AGENT\"}\n}|" "$SETTINGS_FILE"
      echo "✓  Bloc acp.defaultAgent injecté (via sed)"
    fi
  fi

else
  # Aucun fichier existant — créer le dossier config et un settings.json minimal
  SETTINGS_DIR="$OPENCLAW_DATA/config"
  mkdir -p "$SETTINGS_DIR"
  SETTINGS_FILE="$SETTINGS_DIR/settings.json"
  cat > "$SETTINGS_FILE" <<JSON
{
  "acp": {
    "defaultAgent": "$DEFAULT_AGENT"
  }
}
JSON
  echo "✓  Nouveau settings.json créé : $SETTINGS_FILE"
fi

echo ""
echo "─────────────────────────────────────────────────────"
echo "  acp.defaultAgent = \"$DEFAULT_AGENT\""
echo "  Fichier          : $SETTINGS_FILE"
echo "─────────────────────────────────────────────────────"
echo ""
echo "→ Redémarrez le container OpenClaw pour appliquer :"
echo "   docker restart openclaw"
echo ""
echo "→ Le SOUL.md a également été mis à jour avec le tableau"
echo "   complet des agents pour éviter toute ambiguïté future."
