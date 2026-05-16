# AGENTS.md

## Cursor Cloud specific instructions

### Overview

**Forge (DevForge)** is a self-hosted autonomous software development dashboard built with **Astro 6 SSR** + **Preact** + **Tailwind CSS / DaisyUI**. The UI and codebase are in French.

### Stack

- **Framework:** Astro 6 (SSR mode, `output: 'server'`)
- **UI Components:** Preact (`.tsx` interactive islands)
- **Styling:** Tailwind CSS 3 + DaisyUI (custom `forge` theme)
- **Database:** Astro DB (local SQLite via libSQL, auto-created at `.astro/db.sqlite`)
- **Runtime:** Node.js >= 22.12.0
- **Package manager:** npm (lockfile: `package-lock.json`, `.npmrc` sets `legacy-peer-deps=true`)

### Key commands

| Action | Command |
|--------|---------|
| Install deps | `npm install` |
| Dev server | `npm run dev` (serves on `http://localhost:4321`) |
| Build | `npm run build` |
| Preview | `npm run preview` |

### Development notes

- **No ESLint/Prettier/test framework** is configured in this repo. The build (`npm run build`) is the primary correctness check.
- `astro check` may hang in constrained environments; the build is a more reliable validation step.
- The dev server auto-creates the SQLite database and seeds it on first run. No manual DB setup is needed.
- The app redirects unauthenticated users to `/login`. Register via the "Créer un compte" tab (min 10-char password). After registration, the setup wizard at `/setup` can be skipped.
- **OpenClaw** and **Ollama** are optional external services. The dashboard gracefully degrades when they are unreachable.
- The Docker-related API endpoint (`/api/docker.ts`) gracefully returns empty data when Docker is unavailable.
- `scripts/run-astro.mjs` wraps the Astro CLI and auto-sets `ASTRO_DATABASE_FILE` if not provided.
- `scripts/ensure-win32-natives.cjs` is a no-op on Linux (exits immediately on non-Windows).
- `scripts/patch-astro-node-polyfill.cjs` patches a compatibility shim for `@astrojs/node`; it runs automatically via npm lifecycle hooks.
