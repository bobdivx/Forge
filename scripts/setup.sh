#!/bin/bash
MODELS=("qwen2.5:32b" "qwen2.5-coder:7b" "llama3.1:8b")
for model in "${MODELS[@]}"; do
    if ! ollama list | grep -q "$model"; then
        ollama pull "$model"
    fi
done
mkdir -p media/Github
openclaw start --engine ollama --model qwen2.5:32b --instructions ./instructions/SOUL.md --name CHEF_TECHNIQUE
