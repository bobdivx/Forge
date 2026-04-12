#!/bin/bash
# scripts/sync_files_to_db.sh — Met à jour la DB Astro à partir des fichiers .md des agents

PROJECT_DIR="/mnt/GitHub/Forge"

# Liste des agents et leurs fichiers (en relatif par rapport à la racine du projet)
declare -A AGENTS
AGENTS["CHEF_TECHNIQUE"]="instructions/SOUL.md"
AGENTS["ARCHITECTE_LOGICIEL"]="instructions/agents/ARCHITECTE_LOGICIEL.md"
AGENTS["DEV_BACKEND"]="instructions/agents/DEV_BACKEND.md"
AGENTS["DEV_FRONTEND"]="instructions/agents/DEV_FRONTEND.md"
AGENTS["EXPERT_GITHUB"]="instructions/agents/EXPERT_GITHUB.md"
AGENTS["ANALYSTE_CODE"]="instructions/agents/ANALYSTE_CODE.md"
AGENTS["TESTEUR_QA"]="instructions/agents/TESTEUR_QA.md"
AGENTS["INFRA_TECH"]="instructions/agents/INFRA_TECH.md"
AGENTS["SECURITE_CODE"]="instructions/agents/SECURITE_CODE.md"
AGENTS["INGENIEUR_HARDWARE"]="instructions/agents/INGENIEUR_HARDWARE.md"
AGENTS["INGENIEUR_PROMPT"]="instructions/agents/INGENIEUR_PROMPT.md"
AGENTS["MAINTENANCE_REPO"]="instructions/agents/MAINTENANCE_REPO.md"
AGENTS["REDACTEUR_DOC"]="instructions/agents/REDACTEUR_DOC.md"
AGENTS["SCRIPTEUR_AUTOMATE"]="instructions/agents/SCRIPTEUR_AUTOMATE.md"
AGENTS["VEILLE_TECH"]="instructions/agents/VEILLE_TECH.md"

for AGENT_ID in "${!AGENTS[@]}"; do
  FILE_PATH="${AGENTS[$AGENT_ID]}"
  FULL_PATH="$PROJECT_DIR/$FILE_PATH"
  
  if [ -f "$FULL_PATH" ]; then
    echo "Synchronisation de $AGENT_ID depuis $FILE_PATH..."
    CONTENT=$(cat "$FULL_PATH")
    # Échappement des quotes simples pour SQL
    ESCAPED_CONTENT=${CONTENT//\'/\'\'}
    NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    
    QUERY="update AgentInstruction set systemPrompt = '$ESCAPED_CONTENT', updatedAt = '$NOW' where agentId = '$AGENT_ID'"
    
    cd "$PROJECT_DIR" && npx astro db shell --local --query "$QUERY" > /dev/null
  else
    echo "Fichier non trouvé pour $AGENT_ID : $FULL_PATH"
  fi
done

echo "Synchronisation terminée."
