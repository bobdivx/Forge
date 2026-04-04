#!/bin/bash
# agent_workflow.sh — Workflow d'autonomie complet avec reporting Forge DB
# Usage: ./agent_workflow.sh "<NOM_PROJET>" "<DESCRIPTION_TICKET>"
# Exécuté par CHEF_TECHNIQUE via OpenClaw.

set -euo pipefail

PROJECT="${1:-}"
TICKET="${2:-}"
FORGE_API="http://127.0.0.1:4321/api"
REPOS_ROOT="/mnt/GitHub"

if [ -z "$PROJECT" ] || [ -z "$TICKET" ]; then
  echo "Usage: $0 <projet> <description>"
  exit 1
fi

BRANCH_NAME="feature/$(echo "$TICKET" | tr ' ' '-' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]//g' | cut -c1-50)"
REPO_PATH="$REPOS_ROOT/$PROJECT"

hook() {
  local agent="$1" type="$2" title="$3" content="$4" priority="${5:-medium}"
  curl -s -X POST "$FORGE_API/forge-hook" \
    -H "Content-Type: application/json" \
    -d "{
      \"agentId\": \"$agent\",
      \"type\": \"$type\",
      \"title\": \"$title\",
      \"content\": \"$content\",
      \"priority\": \"$priority\",
      \"project\": \"$PROJECT\"
    }" > /dev/null
}

repl() {
  local agent="$1" cmd="$2"
  curl -s -X POST "$FORGE_API/agent-repl" \
    -H "Content-Type: application/json" \
    -d "{\"command\": \"$cmd\", \"agentId\": \"$agent\"}" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('output',''))"
}

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  DevForge Workflow — Autonomie Complète              ║"
echo "╚══════════════════════════════════════════════════════╝"
echo "  Projet : $PROJECT"
echo "  Ticket : $TICKET"
echo "  Branche: $BRANCH_NAME"
echo ""

# ── Étape 1 : Ticket créé dans Forge DB ──────────────────────────────────────
echo "[1/7] Création du ticket dans Forge DB..."
TASK_RESP=$(curl -s -X POST "$FORGE_API/agent-tasks" \
  -H "Content-Type: application/json" \
  -d "{\"agentId\": \"CHEF_TECHNIQUE\", \"task\": \"$TICKET\", \"status\": \"pending\"}")
TASK_ID=$(echo "$TASK_RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('task',{}).get('id','?'))" 2>/dev/null || echo "?")
echo "  → Ticket #$TASK_ID créé."

hook "CHEF_TECHNIQUE" "task" "Nouveau ticket: $TICKET" "Assigné pour $PROJECT. Branche: $BRANCH_NAME. TaskID: $TASK_ID"

# ── Étape 2 : Mise à jour statut → running ────────────────────────────────────
echo "[2/7] Passage en statut 'running'..."
if [ "$TASK_ID" != "?" ]; then
  curl -s -X PUT "$FORGE_API/agent-tasks" \
    -H "Content-Type: application/json" \
    -d "{\"id\": $TASK_ID, \"status\": \"running\", \"output\": \"Branche $BRANCH_NAME en cours\"}" > /dev/null
fi

# ── Étape 3 : Création de la branche ─────────────────────────────────────────
echo "[3/7] Création de la branche..."
if [ -d "$REPO_PATH/.git" ]; then
  git -C "$REPO_PATH" checkout main 2>/dev/null || true
  git -C "$REPO_PATH" pull --rebase 2>/dev/null || true
  git -C "$REPO_PATH" checkout -b "$BRANCH_NAME" 2>/dev/null || git -C "$REPO_PATH" checkout "$BRANCH_NAME"
  echo "  → Branche $BRANCH_NAME créée."
  hook "EXPERT_GITHUB" "completion" "Branche créée: $BRANCH_NAME" "Depuis main. Prête pour développement."
else
  echo "  ⚠ Repo $REPO_PATH introuvable — passage en mode simulation."
  hook "INFRA_TECH" "bug" "Repo introuvable: $PROJECT" "Chemin $REPO_PATH n'existe pas. Créer le repo d'abord." "high"
fi

# ── Étape 4 : Signal aux agents de développement ─────────────────────────────
echo "[4/7] Assignation aux agents de développement..."
hook "CHEF_TECHNIQUE" "message" "Assignation: $TICKET" "DEV_BACKEND et DEV_FRONTEND: implémenter '$TICKET' sur branche $BRANCH_NAME du projet $PROJECT. Reporter via forge-hook à la fin." "high"
hook "CHEF_TECHNIQUE" "message" "Architecture requise: $TICKET" "ARCHITECTE_LOGICIEL: définir la structure pour '$TICKET' dans $PROJECT." "high"
echo "  → Messages envoyés à DEV_BACKEND, DEV_FRONTEND, ARCHITECTE_LOGICIEL."

# ── Étape 5 : Signal à QA ─────────────────────────────────────────────────────
echo "[5/7] Notification TESTEUR_QA (en attente de completion dev)..."
hook "CHEF_TECHNIQUE" "message" "QA planifiée: $TICKET" "TESTEUR_QA: dès réception du message 'completion' de DEV_FRONTEND pour $BRANCH_NAME, auditer et reporter via forge-hook." "medium"

# ── Étape 6 : Statut dans Forge DB ───────────────────────────────────────────
echo "[6/7] Mise à jour statut Forge DB..."
if [ "$TASK_ID" != "?" ]; then
  curl -s -X PUT "$FORGE_API/agent-tasks" \
    -H "Content-Type: application/json" \
    -d "{\"id\": $TASK_ID, \"status\": \"running\", \"output\": \"Agents assignés. En attente de completion.\"}" > /dev/null
fi

# ── Étape 7 : Rapport final ───────────────────────────────────────────────────
echo "[7/7] Workflow déclenché avec succès."
hook "CHEF_TECHNIQUE" "message" "Workflow lancé: $TICKET" "Ticket #$TASK_ID. Branche: $BRANCH_NAME. Agents notifiés. En attente des completions."

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Workflow d'autonomie déclenché ✓                    ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "  Prochaines étapes (automatiques via forge-hook) :"
echo "  1. ARCHITECTE_LOGICIEL → plan d'architecture"
echo "  2. DEV_BACKEND + DEV_FRONTEND → implémentation"
echo "  3. TESTEUR_QA → audit + rapport bugs"
echo "  4. ANALYSTE_CODE → code review"
echo "  5. EXPERT_GITHUB → PR vers main"
echo "  6. CHEF_TECHNIQUE → validation et merge"
echo ""
echo "  Suivi en temps réel : http://127.0.0.1:4321/agents"
echo "  Bugs remontés       : http://127.0.0.1:4321/orchestration"
