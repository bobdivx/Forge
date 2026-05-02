import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwind from '@astrojs/tailwind';
import preact from '@astrojs/preact';
import db from '@astrojs/db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  output: 'server',
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT) || 4321,
  },
  vite: {
    server: {
      allowedHosts: ['forge.briseteia.me', 'oc.briseteia.me', 'localhost', '127.0.0.1', 'zimacube.local'],
      /** Si 4321 est pris (autre dev), Vite choisit un port libre au lieu d’échouer. */
      strictPort: false,
      // Sur lecteur réseau (Y:), le watcher peut boucler sur .env — redémarrer le dev à la main après édition.
      watch: {
        ignored: [
          path.join(__dirname, '.env'),
          path.join(__dirname, '.env.local'),
          path.join(__dirname, '.env.development'),
          path.join(__dirname, '.env.production'),
          path.join(__dirname, 'node_modules', '@astrojs', 'tailwind', 'base.css'),
        ],
      },
    },
    optimizeDeps: {
      // marked + dompurify (Markdown.tsx) : évite 504 "Outdated Optimize Dep" en dev
      // quand le cache .vite dérive après changements de deps.
      include: ['chart.js/auto', 'marked', 'dompurify'],
    },
  },
  adapter: node({
    mode: 'standalone',
  }),
  // `db()` en premier : réduit les courses avec d’autres intégrations Vite.
  integrations: [db(), tailwind(), preact()],
  db: {
    studio: false
  }
});// Force Restart
