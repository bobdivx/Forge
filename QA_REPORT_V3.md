# Rapport d'Incidents Critiques - v1.2.0

Suite aux remontées manuelles de l'administrateur (Mathieu), l'agent TESTEUR_QA a déclenché un audit ciblé en profondeur et un re-build complet :

**Bugs Confirmés et Résolus :**
1. [x] **Menu Hamburger Inactif (Landing Page)** : Le bouton de la landing page était purement esthétique (SVG HTML). Un composant interactif Preact `LandingMobileMenu.tsx` a été intégré.
2. [x] **Redirections cassées (404)** : Les liens pointant vers `/dashboard` (ancien nom) pointaient dans le vide. Ils ont été réécrits pour pointer vers la page des Applications (`/apps`).
3. [x] **Page Vide (/settings)** : La route "Paramètres ZimaOS" a été construite. Elle n'est plus une duplication du dashboard mais propose une vraie UI de mapping des volumes NAS (`/media/Docker/yaml`, `/media/Github`).

Le build Astro a été validé.
