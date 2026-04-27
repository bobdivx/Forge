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
    port: 4321,
  },
  vite: {
    server: {
      allowedHosts: ['forge.briseteia.me', 'oc.briseteia.me', 'localhost', '127.0.0.1', 'zimacube.local'],
      strictPort: true,
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
      include: ['chart.js/auto']
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
});