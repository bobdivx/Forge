#!/bin/bash
# Script de commit automatique — à exécuter sur le ZimaCube depuis /mnt/GitHub/Forge
set -e

cd "$(dirname "$0")/.."

echo "=== Git status ==="
git status --short

echo ""
echo "=== Staging new files ==="
git add src/lib/forge-tools.ts
git add src/lib/forge-commands.ts
git add src/pages/api/forge-tools.ts
git add src/pages/api/agent-memory.ts
git add src/pages/api/agent-repl.ts
git add "src/components/agents/AgentRepl.tsx"
git add db/config.ts
git add src/pages/api/agent-tasks.ts
git add src/pages/agents.astro

echo ""
echo "=== Fichiers stagés ==="
git diff --cached --name-only

echo ""
echo "=== Commit ==="
git commit -m "feat(repl): ForgeTool abstraction, slash commands, AgentMemory and REPL UI

- forge-tools.ts: 10 tools (git, file, docker, system) + toolRegistry
- forge-commands.ts: slash command registry + Tab autocomplete (isomorphic)
- AgentMemory: new Astro DB table for persistent agent memory per agentId
- /api/forge-tools: GET list / POST execute any ForgeTool
- /api/agent-memory: GET/POST/DELETE memories per agent
- /api/agent-repl: unified slash command executor (/help /tools /memory /task)
- AgentRepl.tsx: terminal-style Preact REPL (macOS chrome, history, autocomplete)
- agents.astro: AgentRepl section integrated
- agent-tasks.ts: POST handler added"

echo ""
echo "=== Derniers commits ==="
git log --oneline -4

echo ""
echo "=== Migration Astro DB ==="
echo "Redémarre le serveur Forge pour appliquer le nouveau schéma AgentMemory."
echo "En mode dev (astro dev), la migration est automatique au redémarrage."
