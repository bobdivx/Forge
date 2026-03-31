# Propositions d'Évolution Spontanées (VEILLE_TECH & ARCHITECTE_LOGICIEL)
*Date: 31 Mars 2026*

## 1. Monitoring Temps Réel (Docker & VRAM)
**Problème actuel :** Le dashboard affiche des valeurs statiques (ex: VRAM: 65%) et ne remonte pas l'état réel du CPU/RAM du NAS ZimaBoard.
**Solution proposée :** Créer un agent `INFRA_MONITOR` (ou utiliser `INFRA_TECH`) qui lit périodiquement `/proc/meminfo` et l'API Docker locale, et expose ces données via `/api/system-status`. Le composant `AgentStats.tsx` consommera cette API pour un vrai dashboard "Live".
**Impact :** Élevé (Valeur ajoutée immédiate pour la Forge).
**Coût (Temps/Ressources) :** Faible (Backend Node.js standard).

## 2. Déploiement "One-Click" Turso (Base de données)
**Problème actuel :** Les applications générées par la Forge n'ont pas de base de données provisionnée automatiquement.
**Solution proposée :** Intégrer le SDK LibSQL/Turso. Lors d'un `CREATE_NEW_APP`, l'agent `DEV_BACKEND` provisionne automatiquement une base Turso gratuite via l'API, et injecte le `TURSO_DATABASE_URL` dans le `.env` de la nouvelle app.
**Impact :** Très Élevé (Transformation en vrai PaaS complet).
**Coût :** Moyen (Nécessite le token API Turso dans les secrets de la Forge).

## 3. Terminal Web Intégré (SSHD)
**Problème actuel :** Mathieu doit utiliser un terminal externe pour interagir avec le NAS en dehors de la Forge.
**Solution proposée :** Intégrer `xterm.js` dans la page `/settings` pour offrir un accès shell direct et sécurisé au conteneur principal de la Forge depuis l'interface web.
**Impact :** Moyen (Confort d'utilisation).
**Coût :** Élevé (Complexité Websocket + Sécurité stricte requise).

---
**Décision en attente du CHEF_TECHNIQUE :**
Veuillez approuver la proposition prioritaire pour initier le sprint de développement autonome.
