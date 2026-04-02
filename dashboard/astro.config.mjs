import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwind from '@astrojs/tailwind';
import preact from '@astrojs/preact';
import db from '@astrojs/db';

export default defineConfig({
  output: 'server',
  server: {
    host: '0.0.0.0',
    port: 4321,
  },
  vite: {
    server: {
      allowedHosts: ['forge.briseteia.me', 'oc.briseteia.me', 'localhost', '127.0.0.1'],
      strictPort: true,
    },
  },
  adapter: node({
    mode: 'standalone',
  }),
  integrations: [tailwind(), preact(), db()],
  db: {
    studio: false
  }
});