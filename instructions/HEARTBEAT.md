# HEARTBEAT.md - Supervision Continue

Objectif : automatiser la surveillance des repositories dans `media/Github` et assurer une sauvegarde nocturne.

## Surveillance périodique
Fréquence : toutes les 30 minutes
- Vérifier l'état Git local de chaque repository.
- Détecter les changements non commités.
- Vérifier l'accessibilité distante via GitHub CLI.
- Remonter les incidents à `CHEF_TECHNIQUE`.

## Sauvegarde nocturne
Fréquence : 1 fois par jour à 02:00
- Parcourir tous les repositories dans `media/Github`.
- Exécuter `git add -A`.
- Exécuter `git commit -m "chore: nightly backup"` si changements détectés.
- Exécuter `git push` sur la branche active.

## Escalade
- Si push impossible, ouvrir une issue via `gh`.
- Si erreur d'authentification, notifier `EXPERT_GITHUB`.
- Si saturation système, notifier `INGENIEUR_HARDWARE`.
