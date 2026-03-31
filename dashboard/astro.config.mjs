import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import vercel from '@astrojs/vercel';
import tailwind from '@astrojs/tailwind';
import preact from '@astrojs/preact';

const isVercel = !!process.env.VERCEL || !!process.env.VERCEL_ENV;

export default defineConfig({
  output: 'server',
  adapter: isVercel ? vercel() : node({
    mode: 'standalone',
  }),
  integrations: [tailwind(), preact()],
  server: {
    host: true,
    port: 4321,
  },
  vite: {
    server: {
      allowedHosts: ['ethlt-176-141-56-231.a.free.pinggy.link', '.pinggy.link', 'all'],
    },
  },
});
