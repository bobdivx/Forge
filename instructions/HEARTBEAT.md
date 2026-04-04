# HEARTBEAT.md — Supervision Continue et Sauvegarde

Exécuté par : `CHEF_TECHNIQUE` (Bob) ou `MAINTENANCE_REPO`
Fréquence surveillance : toutes les 30 minutes
Fréquence sauvegarde : 1 fois par jour à 02:00

---

## Surveillance périodique (toutes les 30 min)

### 1. Vérifier les tâches et bugs en attente dans la Forge DB
```bash
# Lire les tâches pending et bugs ouverts
TASKS=$(curl -s http://127.0.0.1:4321/api/agent-tasks)
PENDING=$(echo "$TASKS" | python3 -c "
import json,sys
data = json.load(sys.stdin)
tasks = data.get('tasks', [])
pending = [t for t in tasks if t['status'] in ['pending','bug']]
print(f'Tâches en attente: {len(pending)}')
for t in pending[:5]:
    print(f\"  [{t['status'].upper()}] #{t['id']} {t['agentId']}: {t['task'][:60]}\")
")
echo "$PENDING"

# Si tâches en attente → remonter à Bob
if [ -n "$PENDING" ]; then
  curl -s -X POST http://127.0.0.1:4321/api/forge-hook \
    -H "Content-Type: application/json" \
    -d "{
      \"agentId\": \"MAINTENANCE_REPO\",
      \"type\": \"message\",
      \"to\": \"CHEF_TECHNIQUE\",
      \"title\": \"Heartbeat: tâches en attente\",
      \"content\": \"$PENDING\"
    }"
fi
```

### 2. Vérifier l'état Git de chaque repository
```bash
for repo in /mnt/GitHub/*/; do
  PROJECT=$(basename "$repo")
  STATUS=$(git -C "$repo" status --short 2>/dev/null | head -5)
  UNCOMMITTED=$(git -C "$repo" status --short 2>/dev/null | wc -l)
  
  if [ "$UNCOMMITTED" -gt 0 ]; then
    curl -s -X POST http://127.0.0.1:4321/api/forge-hook \
      -H "Content-Type: application/json" \
      -d "{
        \"agentId\": \"MAINTENANCE_REPO\",
        \"type\": \"message\",
        \"to\": \"CHEF_TECHNIQUE\",
        \"title\": \"Git: $PROJECT a $UNCOMMITTED fichiers non commités\",
        \"content\": \"$STATUS\",
        \"project\": \"$PROJECT\"
      }"
  fi
done
```

### 3. Vérifier la santé du gateway OpenClaw
```bash
# Optionnel : source scripts/forge_env.sh  → OPENCLAW_GATEWAY_URL (défaut http://127.0.0.1:18789)
OPENCLAW_GATEWAY_URL="${OPENCLAW_GATEWAY_URL:-http://127.0.0.1:18789}"
HEALTH=$(curl -s "${OPENCLAW_GATEWAY_URL}/health" 2>/dev/null | python3 -c "
import json,sys
try:
    d = json.load(sys.stdin)
    agents = d.get('agents', [])
    print(f'{len(agents)} agents actifs')
except:
    print('Gateway injoignable')
" 2>/dev/null || echo "Gateway injoignable")

if echo "$HEALTH" | grep -q "injoignable"; then
  curl -s -X POST http://127.0.0.1:4321/api/forge-hook \
    -H "Content-Type: application/json" \
    -d "{
      \"agentId\": \"MAINTENANCE_REPO\",
      \"type\": \"bug\",
      \"title\": \"[INFRA] Gateway OpenClaw injoignable\",
      \"content\": \"URL: ${OPENCLAW_GATEWAY_URL}. Vérifier le conteneur openclaw.\",
      \"priority\": \"critical\",
      \"project\": \"Infrastructure\"
    }"
fi
```

### 4. Vérifier la santé du dashboard Forge
```bash
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4321/api/forge-hook)
if [ "$HTTP_CODE" != "200" ] && [ "$HTTP_CODE" != "405" ]; then
  # On s'envoie un message via un canal alternatif (fichier log)
  echo "[$(date)] ALERTE: Forge Dashboard down (HTTP $HTTP_CODE)" >> /mnt/GitHub/Forge/heartbeat.log
fi
```

---

## Sauvegarde nocturne (02:00)

```bash
#!/bin/bash
# Sauvegarde automatique de tous les repos

SUCCESS=0
FAILED=0

for repo in /mnt/GitHub/*/; do
  PROJECT=$(basename "$repo")
  
  # Ignorer les dossiers non-git
  if [ ! -d "$repo/.git" ]; then
    continue
  fi
  
  CHANGES=$(git -C "$repo" status --short 2>/dev/null | wc -l)
  
  if [ "$CHANGES" -gt 0 ]; then
    git -C "$repo" add -A 2>/dev/null
    git -C "$repo" commit -m "chore: nightly backup $(date +%Y-%m-%d)" 2>/dev/null
    
    if git -C "$repo" push 2>/dev/null; then
      SUCCESS=$((SUCCESS + 1))
      curl -s -X POST http://127.0.0.1:4321/api/forge-hook \
        -H "Content-Type: application/json" \
        -d "{
          \"agentId\": \"MAINTENANCE_REPO\",
          \"type\": \"completion\",
          \"title\": \"Backup nuit: $PROJECT\",
          \"content\": \"$CHANGES fichiers sauvegardés et pushés.\",
          \"project\": \"$PROJECT\"
        }" > /dev/null
    else
      FAILED=$((FAILED + 1))
      curl -s -X POST http://127.0.0.1:4321/api/forge-hook \
        -H "Content-Type: application/json" \
        -d "{
          \"agentId\": \"MAINTENANCE_REPO\",
          \"type\": \"bug\",
          \"title\": \"[GIT] Push échoué: $PROJECT\",
          \"content\": \"Backup local OK mais push GitHub échoué. Vérifier token EXPERT_GITHUB.\",
          \"priority\": \"high\",
          \"project\": \"$PROJECT\"
        }" > /dev/null
    fi
  fi
done

# Rapport final
curl -s -X POST http://127.0.0.1:4321/api/forge-hook \
  -H "Content-Type: application/json" \
  -d "{
    \"agentId\": \"MAINTENANCE_REPO\",
    \"type\": \"completion\",
    \"title\": \"Backup nocturne terminé\",
    \"content\": \"$SUCCESS repos sauvegardés, $FAILED erreurs.\"
  }" > /dev/null
```

---

## Escalade automatique

| Condition | Action |
|-----------|--------|
| Gateway OpenClaw down | Bug `critical` → forge-hook → CHEF_TECHNIQUE alerte |
| Push GitHub échoué | Bug `high` → forge-hook → EXPERT_GITHUB résout |
| > 10 tâches pending | Message → CHEF_TECHNIQUE pour priorisation |
| Saturation disque > 90% | Bug `critical` → forge-hook → INGENIEUR_HARDWARE |
