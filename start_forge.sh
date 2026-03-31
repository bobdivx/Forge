#!/bin/bash
mkdir -p dashboard
cd dashboard
npm create astro@latest . -- --template minimal --install --no-git --typescript strict
npm install @astrojs/node @astrojs/tailwind @astrojs/preact tailwindcss preact
openclaw start --engine ollama --model qwen2.5:32b --instructions ../instructions/SOUL.md &
npm run dev
