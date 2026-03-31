import { renderers } from './renderers.mjs';
import { c as createExports, s as serverEntrypointModule } from './chunks/_@astrojs-ssr-adapter_CFaab0UK.mjs';
import { manifest } from './manifest_BJEBcXZJ.mjs';

const serverIslandMap = new Map();;

const _page0 = () => import('./pages/_image.astro.mjs');
const _page1 = () => import('./pages/api/agents.astro.mjs');
const _page2 = () => import('./pages/api/create.astro.mjs');
const _page3 = () => import('./pages/apps.astro.mjs');
const _page4 = () => import('./pages/dashboard.astro.mjs');
const _page5 = () => import('./pages/orchestration.astro.mjs');
const _page6 = () => import('./pages/reports.astro.mjs');
const _page7 = () => import('./pages/settings.astro.mjs');
const _page8 = () => import('./pages/swarm.astro.mjs');
const _page9 = () => import('./pages/index.astro.mjs');
const pageMap = new Map([
    ["node_modules/astro/dist/assets/endpoint/node.js", _page0],
    ["src/pages/api/agents.ts", _page1],
    ["src/pages/api/create.ts", _page2],
    ["src/pages/apps.astro", _page3],
    ["src/pages/dashboard.astro", _page4],
    ["src/pages/orchestration.astro", _page5],
    ["src/pages/reports.astro", _page6],
    ["src/pages/settings.astro", _page7],
    ["src/pages/swarm.astro", _page8],
    ["src/pages/index.astro", _page9]
]);

const _manifest = Object.assign(manifest, {
    pageMap,
    serverIslandMap,
    renderers,
    actions: () => import('./noop-entrypoint.mjs'),
    middleware: () => import('./_noop-middleware.mjs')
});
const _args = {
    "mode": "standalone",
    "client": "file:///media/Github/Forge/dashboard/dist/client/",
    "server": "file:///media/Github/Forge/dashboard/dist/server/",
    "host": true,
    "port": 4321,
    "assets": "_astro",
    "experimentalStaticHeaders": false
};
const _exports = createExports(_manifest, _args);
const handler = _exports['handler'];
const startServer = _exports['startServer'];
const options = _exports['options'];
const _start = 'start';
if (Object.prototype.hasOwnProperty.call(serverEntrypointModule, _start)) {
	serverEntrypointModule[_start](_manifest, _args);
}

export { handler, options, pageMap, startServer };
