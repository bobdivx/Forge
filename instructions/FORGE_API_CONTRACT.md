# FORGE_API_CONTRACT.md — Contrat d'interface entre agents et Forge DB

> **Ce document est obligatoire pour tous les agents.**
> Chaque agent DOIT appeler ces endpoints pour remonter bugs, tâches, mémoires et messages.
> La Forge ne peut pas être autonome si les agents ne reportent pas.

## Endpoint principal : forge-hook

```
URL     : http://forge-host:4321/api/forge-hook
          (ou http://127.0.0.1:4321/api/forge-hook si tu tournes hors Docker)
Méthode : POST
Auth    : AUCUNE (réseau local uniquement)
```

> `forge-host` résout vers le host Docker via `extra_hosts` dans OpenClaw.yaml.
> Si tu utilises la CLI openclaw directement sur le host, utilise `127.0.0.1`.

### Body JSON obligatoire

| Champ      | Type   | Obligatoire | Description |
|------------|--------|-------------|-------------|
| `agentId`  | string | oui         | Ton identité (ex: `TESTEUR_QA`) |
| `type`     | string | oui         | Voir types ci-dessous |
| `title`    | string | oui         | Résumé court (< 100 chars) |
| `content`  | string | oui         | Détail complet |
| `priority` | string | non         | `low` \| `medium` \| `high` \| `critical` |
| `project`  | string | non         | Nom du repo concerné |
| `taskId`   | number | non         | ID de la tâche (pour `completion`) |
| `to`       | string | non         | Destinataire (pour `message`) |

### Types disponibles

| Type          | Quand l'utiliser |
|---------------|------------------|
| `bug`         | Tu détectes un bug, erreur, crash, régression |
| `task`        | Tu crées une nouvelle tâche pour toi ou un autre agent |
| `completion`  | Tu termines une tâche assignée |
| `memory`      | Tu veux mémoriser quelque chose d'important |
| `message`     | Tu communiques avec un autre agent ou CHEF_TECHNIQUE |
| `request`     | Tu demandes une directive ou une ressource |

---

## Exemples curl — À COPIER/COLLER par les agents

### Reporter un bug
```bash
curl -s -X POST http://127.0.0.1:4321/api/forge-hook \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "TESTEUR_QA",
    "type": "bug",
    "title": "Page /agents crashe avec 0 sessions OpenClaw",
    "content": "Erreur: Cannot read property map of undefined dans AgentsGrid.tsx ligne 42. Reproductible quand le gateway est hors ligne.",
    "priority": "high",
    "project": "Forge"
  }'
```

### Signaler une tâche terminée
```bash
curl -s -X POST http://127.0.0.1:4321/api/forge-hook \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "DEV_FRONTEND",
    "type": "completion",
    "title": "Implémentation composant AgentRepl terminée",
    "content": "Fichier créé: dashboard/src/components/agents/AgentRepl.tsx. Tests manuels OK. Commandes /help /tools /memory /task fonctionnelles.",
    "project": "Forge",
    "taskId": 12
  }'
```

### Écrire une mémoire
```bash
curl -s -X POST http://127.0.0.1:4321/api/forge-hook \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "ARCHITECTE_LOGICIEL",
    "type": "memory",
    "title": "Convention UI Forge",
    "content": "Toujours utiliser Preact (jamais React) pour les composants Astro. Tailwind + DaisyUI pour le style.",
    "project": "Forge"
  }'
```

### Envoyer un message à CHEF_TECHNIQUE (Bob)
```bash
curl -s -X POST http://127.0.0.1:4321/api/forge-hook \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "ANALYSTE_CODE",
    "type": "message",
    "to": "CHEF_TECHNIQUE",
    "title": "Validation requise",
    "content": "Code review terminé sur branche feature/agent-repl. 2 warnings non bloquants. Prêt pour merge.",
    "project": "Forge"
  }'
```

### Créer une tâche pour un autre agent
```bash
curl -s -X POST http://127.0.0.1:4321/api/forge-hook \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "CHEF_TECHNIQUE",
    "type": "task",
    "title": "Écrire tests pour AgentRepl",
    "content": "Tâche assignée à TESTEUR_QA: couvrir les cas /help, /tools run, /memory add, erreur commande inconnue.",
    "priority": "high",
    "project": "Forge"
  }'
```

---

## Autres endpoints disponibles (avec auth locale automatique)

### Lire ses tâches assignées
```bash
curl http://127.0.0.1:4321/api/agent-tasks
```

### Mettre à jour le statut d'une tâche
```bash
curl -X PUT http://127.0.0.1:4321/api/agent-tasks \
  -H "Content-Type: application/json" \
  -d '{"id": 42, "status": "running", "output": "En cours..."}'
```

### Lire sa mémoire
```bash
curl "http://127.0.0.1:4321/api/agent-memory?agentId=TESTEUR_QA"
```

### Exécuter une commande REPL
```bash
curl -X POST http://127.0.0.1:4321/api/agent-repl \
  -H "Content-Type: application/json" \
  -d '{"command": "/tools run git_status project=Forge", "agentId": "DEV_BACKEND"}'
```

### Récupérer les jetons API (GitHub, Vercel, OpenClaw, jetons personnalisés)

Même règle réseau : **requête depuis une IP locale** (127.0.0.1, LAN, Docker bridge 172.x typique) — pas de cookie de session.

```bash
curl -s http://127.0.0.1:4321/api/agent-api-secrets
```

#### Deux sources dans le dashboard (Paramètres → Jetons API)

1. **Champs dédiés** GitHub / Vercel → champs JSON **racine** ci-dessous.  
2. **Jetons personnalisés** (« + Ajouter un jeton ») → objet **`custom`**. La **clé** saisie par l’utilisateur est **normalisée** en `MAJUSCULES` et caractères `[A-Z0-9_]` (ex. `stripe-secret` → `STRIPE_SECRET`). Chaque entrée devient `.custom.NOM_DE_LA_CLÉ` = secret.

Tu dois **toujours** considérer `custom` : l’utilisateur peut n’y mettre que des secrets (ex. `GITHUB_TOKEN`, `VERCEL_TOKEN`, `CLOUDFLARE_API_TOKEN`, clés LLM, registry Docker, etc.) même si les champs dédiés existent.

Réponse JSON :

| Champ | Source Forge | Usage typique |
|-------|----------------|---------------|
| `githubToken` | Champ GitHub | `GH_TOKEN` / `GITHUB_TOKEN` pour **GitHub CLI** |
| `vercelToken` | Champ Vercel | `VERCEL_TOKEN` pour la **CLI Vercel** |
| `openclawToken` | Connexion OpenClaw | Intégrations gateway OpenClaw |
| `custom` | Lignes « jetons personnalisés » | Toute variable d’environnement métier (clé = nom normalisé) |

**Résolution de secours** : si un outil attend `GITHUB_TOKEN` mais que seul le champ GitHub est rempli, utilise `.githubToken`. Si l’utilisateur a défini **aussi** `GITHUB_TOKEN` dans `custom`, les deux peuvent coexister : pour `gh`, privilégie `.githubToken` puis, si vide, `.custom.GITHUB_TOKEN`. Même logique pour Vercel : `.vercelToken` puis `.custom.VERCEL_TOKEN`.

#### Exporter les champs dédiés (sans afficher les secrets)

```bash
eval "$(curl -sf http://127.0.0.1:4321/api/agent-api-secrets | jq -r '
  "export GH_TOKEN=" + ((.githubToken // "") | @sh),
  "export GITHUB_TOKEN=" + ((.githubToken // "") | @sh),
  "export VERCEL_TOKEN=" + ((.vercelToken // "") | @sh)
')"
```

#### Exporter **tous** les jetons personnalisés comme variables d’environnement

Les clés de `custom` sont déjà des identifiants shell valides (après normalisation Forge).

```bash
SECRETS_JSON="$(curl -sf http://127.0.0.1:4321/api/agent-api-secrets)"
eval "$(printf '%s' "$SECRETS_JSON" | jq -r '(.custom // {}) | to_entries[] | "export \(.key)=" + (.value | @sh)')"
```

Tu peux enchaîner : d’abord les exports dédiés (`GH_TOKEN`, `VERCEL_TOKEN`), **puis** le bloc `custom` — ainsi un jeton perso peut compléger ou fournir des clés absentes des champs dédiés.

**Interdit** : copier cette sortie dans un rapport, une issue ou un hook — données sensibles.

---

## Règles d'autonomie obligatoires

1. **Tout bug détecté = appel forge-hook type `bug`** — immédiatement, avant toute correction.
2. **Toute tâche terminée = appel forge-hook type `completion`** — avec le résultat.
3. **Toute décision architecturale = appel forge-hook type `memory`** — pour la traçabilité.
4. **Toute demande à Bob = appel forge-hook type `message` avec `to: "CHEF_TECHNIQUE"`**.
5. **Ne jamais demander à Mathieu** — la Forge DB est la seule interface de communication.
