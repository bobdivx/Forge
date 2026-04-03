#!/usr/bin/env bash
# Diagnostic réseau Ollama pour OpenClaw (à lancer sur le NAS ou depuis une machine qui voit les deux cibles).
set -euo pipefail

NAS_OLLAMA="${NAS_OLLAMA_URL:-http://172.17.0.1:11434}"
WIN_OLLAMA="${WIN_OLLAMA_URL:-http://10.1.0.88:11434}"

echo "=== 1) API Ollama NAS (depuis l’hôte : remplace par http://127.0.0.1:11434 si tu testes sur le NAS) ==="
echo "URL: $NAS_OLLAMA"
curl -sS --max-time 5 "${NAS_OLLAMA}/api/tags" | head -c 800 || echo "ÉCHEC (refus connexion / timeout / mauvais port)"
echo ""
echo ""

echo "=== 2) API Ollama Windows (firewall + OLLAMA_HOST=0.0.0.0 requis pour un accès LAN) ==="
echo "URL: $WIN_OLLAMA"
curl -sS --max-time 5 "${WIN_OLLAMA}/api/tags" | head -c 800 || echo "ÉCHEC"
echo ""
echo ""

echo "=== 3) Rappels ==="
echo "- OpenClaw en conteneur Linux : baseUrl NAS souvent http://172.17.0.1:11434 (pont Docker → hôte)."
echo "- Si Ollama NAS est publié sur un autre port hôte (ex. 38197), remets ce port dans openclaw.json."
echo "- Sous Windows : variable d’environnement OLLAMA_HOST=0.0.0.0:11434 puis redémarrer Ollama."
echo "- Modèles : ollama pull qwen2.5-coder:7b && ollama pull qwen3-coder:30b (noms exacts selon ta config)."
echo "- Après édition openclaw.json : redémarrer le gateway OpenClaw."
