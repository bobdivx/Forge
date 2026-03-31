# HEARTBEAT.md - Moteur d'Autonomie (NAS)

Objectif : Cycle d'audit et d'orchestration toutes les 30 minutes.

## Boucle d'Autonomie
1. **Audit Global** : Lancer l'analyseur sur les logs Astro/Docker.
2. **Génération de Tickets** : Si anomalie (ex: RAM > 90%, 404 detectée), l'ANALYSTE_CODE crée une "Issue" interne.
3. **Workflow Git (Autonome)** : 
   - Détection des branches orphelines.
   - Demande de PR à EXPERT_GITHUB.
   - Validation automatique par le CHEF_TECHNIQUE si QA_REPORT est `SUCCESS`.
4. **Déploiement Continue (CD)** : Pousser vers GitHub `main` pour déclencher Vercel.

## Escalade
Si la validation échoue 3 fois, notifier Mathieu via interface.
