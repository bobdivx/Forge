/* empty css                                */
import { e as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead, g as addAttribute } from '../chunks/astro/server_y1XpGNYX.mjs';
import 'piccolore';
import { $ as $$DashboardLayout } from '../chunks/DashboardLayout_CgAasVuI.mjs';
import { W as WireLogs, A as AppLauncher } from '../chunks/WireLogs_BZsJ8kFB.mjs';
export { renderers } from '../renderers.mjs';

const $$Apps = createComponent(($$result, $$props, $$slots) => {
  const deployedApps = [
    { name: "tesla", status: "Online", lastDeploy: "2h ago", url: "tesla.forge.local" },
    { name: "ZimaOS-MCP", status: "Building", lastDeploy: "5m ago", url: "mcp.forge.local" },
    { name: "mcp-turso", status: "Online", lastDeploy: "1d ago", url: "turso.forge.local" },
    { name: "popcorn", status: "Offline", lastDeploy: "3d ago", url: "popcorn.forge.local" }
  ];
  return renderTemplate`${renderComponent($$result, "DashboardLayout", $$DashboardLayout, { "title": "Applications", "currentPath": "/apps" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="max-w-7xl mx-auto space-y-8"> <div class="flex items-end justify-between"> <div> <h2 class="text-2xl font-bold tracking-tight text-white">Vos Applications</h2> <p class="mt-1 text-sm text-slate-400">Applications gérées et déployées par les agents DevForge.</p> </div> </div> <div class="grid grid-cols-1 lg:grid-cols-3 gap-6"> <div class="lg:col-span-2 flex flex-col gap-6"> <div class="grid grid-cols-1 md:grid-cols-2 gap-4"> ${deployedApps.map((app) => renderTemplate`<div class="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-blue-500/50 transition cursor-pointer group shadow-sm hover:shadow-lg"> <div class="flex justify-between items-start mb-4"> <div class="flex items-center gap-3"> <div${addAttribute(`h-10 w-10 rounded-lg flex items-center justify-center font-bold text-lg border
                    ${app.status === "Online" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : app.status === "Building" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-slate-800 text-slate-400 border-slate-700"}`, "class")}> ${app.name.charAt(0).toUpperCase()} </div> <div> <h3 class="font-semibold text-white group-hover:text-blue-400 transition">${app.name}</h3> <a${addAttribute(`http://${app.url}`, "href")} target="_blank" class="text-xs text-slate-400 hover:text-slate-300 transition">${app.url}</a> </div> </div> <span${addAttribute(`text-xs px-2 py-1 rounded-full border
                  ${app.status === "Online" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : app.status === "Building" ? "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse" : "bg-slate-800 text-slate-400 border-slate-700"}`, "class")}> ${app.status} </span> </div> <div class="flex items-center text-xs text-slate-500"> <svg class="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path> </svg>
Dernier déploiement: ${app.lastDeploy} </div> </div>`)} </div> <div class="mt-4"> ${renderComponent($$result2, "WireLogs", WireLogs, { "client:load": true, "client:component-hydration": "load", "client:component-path": "/media/Github/Forge/dashboard/src/components/WireLogs", "client:component-export": "default" })} </div> </div> <div class="space-y-6"> <div class="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 shadow-xl rounded-xl p-[1px]"> <div class="bg-slate-900 rounded-xl p-5 h-full relative overflow-hidden"> <div class="absolute -right-10 -top-10 w-32 h-32 bg-blue-600/20 rounded-full blur-[40px]"></div> ${renderComponent($$result2, "AppLauncher", AppLauncher, { "client:load": true, "client:component-hydration": "load", "client:component-path": "/media/Github/Forge/dashboard/src/components/AppLauncher", "client:component-export": "default" })} </div> </div> </div> </div> </div> ` })}`;
}, "/media/Github/Forge/dashboard/src/pages/apps.astro", void 0);

const $$file = "/media/Github/Forge/dashboard/src/pages/apps.astro";
const $$url = "/apps";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Apps,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
