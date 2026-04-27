#!/bin/bash

# Le modele peut desormais etre passe en variable d'environnement OLLAMA_MODEL depuis l'API
# Sinon on fallback sur glm-4.7-flash
MODEL_TO_USE="${OLLAMA_MODEL:-glm-4.7-flash}"

export OLLAMA_HOST="http://localhost:11434"
export OLLAMA_MODEL="$MODEL_TO_USE"

export ANTHROPIC_BASE_URL="$OLLAMA_HOST/v1"
export ANTHROPIC_API_KEY="ollama" 

echo "Démarrage de Claude Code branché sur Ollama ($OLLAMA_MODEL)..."

npx -y @anthropic-ai/claude-code "$@"
