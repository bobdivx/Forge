#!/bin/bash
# Démarre le dashboard Forge depuis la racine du dépôt (plus de sous-dossier dashboard).
set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"
openclaw start --engine ollama --model qwen2.5:32b --instructions "$REPO_ROOT/instructions/SOUL.md" &
npm run dev
