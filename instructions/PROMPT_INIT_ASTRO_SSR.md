Agis en tant qu'Architecte Fullstack. Déploie une forge logicielle autonome de 14 agents via OpenClaw et Ollama.

Objectifs :
- Crée le fichier SOUL.md pour le CHEF_TECHNIQUE (Ollama qwen2.5:32b). Il doit pouvoir créer de nouvelles applications dans media/Github et générer les fichiers .md de ses 13 sous-agents s'ils sont manquants.
- Développe une interface de gestion avec Astro en mode SSR située dans `dashboard`.
- L'interface doit afficher les logs en temps réel, les stats des agents et un formulaire pour lancer la création d'une nouvelle app via API Route Astro.
- Maintiens une séparation stricte des chemins : `dashboard` pour l'interface, `media/Github` pour les apps générées.

Contraintes :
- Utilise Astro avec l'adaptateur Node.js en output server.
- Styling avec Tailwind CSS.
- Code complet sans commentaires internes.
- Utilisation de shell_execute pour piloter Git et Ollama.
- Si Astro, utiliser uniquement des composants Preact.
