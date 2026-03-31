import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import tailwind from '@astrojs/tailwind';
import preact from '@astrojs/preact';

export default defineConfig({
  output: 'server',
  adapter: node({
    mode: 'standalone',
  }),
  integrations: [tailwind(), preact()],
  vite: {
    server: {
      allowedHosts: ['zimacube.local', 'forge.briseteia.me'],
    },
  },
});
