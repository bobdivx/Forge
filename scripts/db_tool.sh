#!/bin/bash
# scripts/db_tool.sh — Outil pour interagir avec la DB Astro de la Forge

PROJECT_DIR="/mnt/GitHub/Forge"

case "$1" in
  "task")
    # Usage: ./db_tool.sh task "AGENT_ID" "Titre" "Input/Détail" "Status"
    AGENT_ID=$2
    TITLE=${3//\'/\'\'}
    INPUT=${4//\'/\'\'}
    STATUS=${5:-pending}
    NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    QUERY="insert into AgentTask (agentId, task, input, status, createdAt, updatedAt) values ('$AGENT_ID', '$TITLE', '$INPUT', '$STATUS', '$NOW', '$NOW')"
    cd "$PROJECT_DIR" && npx astro db shell --local --query "$QUERY"
    ;;
  "message")
    # Usage: ./db_tool.sh message "FROM" "TO" "Content"
    FROM=$2
    TO=$3
    CONTENT=${4//\'/\'\'}
    NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    QUERY="insert into AgentMessage (fromAgent, toAgent, content, timestamp) values ('$FROM', '$TO', '$CONTENT', '$NOW')"
    cd "$PROJECT_DIR" && npx astro db shell --local --query "$QUERY"
    ;;
  "list-tasks")
    cd "$PROJECT_DIR" && npx astro db shell --local --query "select * from AgentTask order by createdAt desc limit 10"
    ;;
  "list-messages")
    cd "$PROJECT_DIR" && npx astro db shell --local --query "select * from AgentMessage order by timestamp desc limit 10"
    ;;
  *)
    echo "Usage: $0 {task|message|list-tasks|list-messages}"
    exit 1
    ;;
esac
