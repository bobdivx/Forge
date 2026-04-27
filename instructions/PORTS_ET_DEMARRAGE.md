# Ports et demarrage des services Forge

Ce document est la reference unique pour comprendre **qui ecoute ou**, **qui appelle qui**, et **comment demarrer** sans confusion.

## 1) Cartographie rapide des ports

- `Forge (Astro)`:
  - port interne/app: `4321`
  - en dev local: `http://127.0.0.1:4321`
  - en NAS (compose): conteneur `4321` publie en hote `4331` (cf. `forge.yml`)
- `OpenClaw gateway`:
  - port interne OpenClaw standard: `18789`
  - port publie CasaOS observe dans le repo: `24190` (mapping vers `18789`)
- `Ollama API`:
  - port standard: `11434`

## 2) Regle cle: URL vue par le process Forge

Les URLs de config (`openclawGatewayUrl`, `forgePublicUrl`, `ollamaUrl`) sont resolues **cote serveur Forge**.
Ce n'est pas l'URL vue par ton navigateur, mais l'URL joignable depuis le process Node/Astro.

## 3) Priorites de resolution (important)

### Forge base URL (hooks / audits)

Source: `src/lib/forge-hook-base-url.ts`, `scripts/forge_env.sh`

Ordre effectif:
1. `FORGE_HOOK_BASE_URL` (env)
2. `forgePublicUrl` (table Config, ecran Parametres)
3. `PUBLIC_FORGE_URL` puis `PUBLIC_SITE_URL` (env Astro)
4. fallback `http://127.0.0.1:4321`

### OpenClaw gateway URL

Source: `src/lib/openclaw-gateway.ts`

Ordre effectif:
1. `OPENCLAW_GATEWAY_URL` (env)
2. `openclawGatewayUrl` (table Config)
3. auto-detection via `openclaw.json` (`gateway.port`)
4. fallback `http://127.0.0.1:18789`

Notes:
- Le code teste ensuite plusieurs candidats (dont `24190` et `18789`) pour resilier aux migrations.
- Si `OPENCLAW_GATEWAY_URL` est defini, il **ecrase** la valeur en base.

### OpenClaw token

Ordre effectif:
1. `OPENCLAW_GATEWAY_TOKEN` (env)
2. `openclawToken` (table Config)
3. token lu dans `openclaw.json`
4. fallback `casaos`

### Ollama URL

Source: `src/lib/config-db.ts`

Ordre effectif:
1. `ollamaUrl` (table Config)
2. `OLLAMA_HOST` (env)
3. `OLLAMA_ORIGIN` (env)
4. fallback dev `http://127.0.0.1:11434`

## 4) Scenarios de demarrage recommandes

## A. Dev local Windows (sans Docker)

1. Lancer Forge:
   - `npm run dev`
2. Forge ecoute sur `0.0.0.0:4321` (strictPort actif)
3. Config attendue:
   - `forgePublicUrl`: vide ou `http://127.0.0.1:4321`
   - `openclawGatewayUrl`: URL locale reelle (souvent `http://127.0.0.1:24190` si port publie, sinon `:18789`)
   - `ollamaUrl`: `http://127.0.0.1:11434` si Ollama local

## B. Forge en conteneur, OpenClaw sur meme hote Docker/NAS

1. Forge interne reste sur `4321`
2. Exposition hote (UI): ex. `4331 -> 4321`
3. Pour les hooks agents vers Forge:
   - `forgePublicUrl` doit etre joignable depuis OpenClaw.
   - Si Forge tourne sur l'hote en dev: `http://forge-host:4321` via `extra_hosts`.
   - Si Forge tourne en conteneur avec `forge.yml`: `http://forge-host:4331` via `extra_hosts` (`4331 -> 4321`).
4. Pour Forge vers OpenClaw:
   - `openclawGatewayUrl` doit etre joignable depuis conteneur Forge (avec `forge.yml`: `http://host.docker.internal:24190`, sinon IP LAN NAS + port publie, ex. `http://<ip-nas>:24190`)

## C. OpenClaw hors machine Forge

Toujours raisonner en connectivite reseau reelle:
- Agents/OpenClaw -> Forge: utiliser une URL Forge accessible depuis cette machine distante (pas `127.0.0.1` Forge).
- Forge -> OpenClaw: configurer `openclawGatewayUrl` vers une URL accessible depuis la machine Forge.

## 5) Pourquoi il y a confusion aujourd'hui

- Plusieurs ports OpenClaw coexistent (`18789` interne, `24190` publie).
- Plusieurs sources de verite (env + table Config + auto-detection fichier).
- Les exemples docs/scripts mentionnent parfois `4321` (interne service) et parfois `4331` (port hote NAS), tous deux corrects selon contexte.
- Le fallback local (`127.0.0.1`) masque parfois une mauvaise URL en base jusqu'au deploiement.

## 6) Convention a appliquer des maintenant

Pour eviter les erreurs, fixer ces conventions:

1. **Un seul port "produit" pour Forge cote hote NAS**: `4331` (UI utilisateur).
2. **Toujours documenter interne/externe** sous forme `hote:port -> conteneur:port`.
3. **Remplir `forgePublicUrl` explicitement** en production (ne pas laisser vide).
4. **Preferer `openclawGatewayUrl` explicite** et ne definir `OPENCLAW_GATEWAY_URL` en env que pour override volontaire.
5. **Verifier la connectivite depuis le bon point de vue** (navigateur != conteneur Forge != conteneur OpenClaw).

## 7) Checklist diagnostic rapide

1. Forge repond-il localement?
   - `GET /login` sur l'URL locale du process Forge (`127.0.0.1:4321` en dev, ou interne conteneur)
   - `GET /api/network-matrix` pour voir les URL/ports effectivement resolus par Forge
2. Agents peuvent-ils joindre Forge?
   - `forgePublicUrl` teste depuis contexte OpenClaw/agent
3. Forge peut-il joindre OpenClaw?
   - test `openclawGatewayUrl/health`
4. Token valide?
   - verifier `OPENCLAW_GATEWAY_TOKEN` ou `openclawToken`
5. Priorite env/base non contradictoire?
   - si env definie, la base peut sembler "ignoree" (comportement normal)

## 8) Fichiers de reference

- `astro.config.mjs`
- `scripts/run-astro.mjs`
- `scripts/forge_env.sh`
- `src/lib/forge-hook-base-url.ts`
- `src/lib/openclaw-gateway.ts`
- `src/lib/config-db.ts`
- `src/components/settings/IntegrationTab.tsx`
- `forge.yml`
