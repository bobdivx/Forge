# SKILL : GENERER_EQUIPE

## Description
Permet au CHEF_TECHNIQUE de générer les fichiers de configuration de ses 13 sous-agents s'ils n'existent pas encore.

## Instructions d'exécution
Pour chaque agent dans la liste [ARCHITECTE_LOGICIEL, DEV_BACKEND, DEV_FRONTEND, EXPERT_GITHUB, ANALYSTE_CODE, TESTEUR_QA, INFRA_TECH, REDACTEUR_DOC, VEILLE_TECH, SECURITE_CODE, SCRIPTEUR_AUTOMATE, INGENIEUR_PROMPT, MAINTENANCE_REPO] :

1. shell_execute("mkdir -p /media/Github/Forge/instructions/agents")
2. shell_execute("touch /media/Github/Forge/instructions/agents/[NOM].md")
3. shell_write("/media/Github/Forge/instructions/agents/[NOM].md", "Rôle: [NOM]. Modèle délégué: qwen2.5-coder:7b ou llama3.1:8b selon la tâche. Workspace: /media/Github.")
4. ollama_pull("[OLLAMA_MODEL]")