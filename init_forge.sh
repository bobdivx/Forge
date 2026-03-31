#!/bin/bash

MODELS=("qwen2.5:32b" "qwen2.5-coder:7b" "llama3.1:8b")

echo "Tentative de téléchargement des modèles Ollama..."
for model in "${MODELS[@]}"; do
  if command -v ollama >/dev/null 2>&1; then
    if ! ollama list | grep -q "$model"; then
      echo "Pull de $model..."
      ollama pull "$model"
    fi
  else
    echo "Erreur : La commande 'ollama' est introuvable sur ce système. Modèles à pull manuellement sur l'hôte : $model"
  fi
done

WORKSPACE_DIR="/media/Github/Forge"
mkdir -p "$WORKSPACE_DIR/instructions/agents"
cd "$WORKSPACE_DIR" || exit

cat << 'EOF' > instructions/SOUL.md
# SOUL.md - Identité : CHEF_TECHNIQUE
Tu es le cerveau de la forge. Ton workspace est /media/Github.
## Missions
1. Vérifier la présence des 13 sous-agents dans instructions/agents/.
2. Si absents, génère-les en utilisant l'outil shell_write via la compétence GENERER_EQUIPE.
3. Pour toute nouvelle app : CREATE_APP [NOM] -> ARCHITECTE -> DEVS -> GITHUB.
4. Utilise qwen2.5-coder pour le code et llama3.1 pour l'analyse.
EOF

echo "Fichiers de base créés dans $WORKSPACE_DIR/instructions/."
echo "Note : La commande 'openclaw start' n'est pas standard pour démarrer un sous-agent de l'intérieur de l'instance."
