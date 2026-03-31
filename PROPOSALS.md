# Propositions d'Évolution Spontanées (VEILLE_TECH & ARCHITECTE_LOGICIEL)
*Date: 31 Mars 2026*

## 1. Monitoring Temps Réel (Docker & VRAM) [DÉPLOYÉ ✅]
L'API `/api/system-status` est en ligne et fonctionnelle.

## 2. Système de Notifications (DEV_BACKEND)
**Problème :** L'utilisateur doit rafraîchir le dashboard pour voir les changements ou les rapports de bug.
**Solution proposée :** Intégrer un système de notifications via un flux d'événements (Server-Sent Events) ou une simple API de polling pour afficher des Toasts dans l'UI en cas d'erreur QA ou de PR fusionnée.
**Impact :** Élevé (Expérience utilisateur).

## 3. Provisioning Turso (ARCHITECTE_LOGICIEL)
**Problème :** Les nouvelles apps n'ont pas de DB.
**Solution proposée :** Utiliser la CLI `turso` pour créer une base de données dès qu'un ordre `CREATE_NEW_APP` est validé.
**Impact :** Critique pour le SaaS.

---
**Décisions requises du CHEF_TECHNIQUE :**
Veuillez valider la priorité pour le prochain sprint.
