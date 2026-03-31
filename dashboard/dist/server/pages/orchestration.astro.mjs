/* empty css                                */
import { e as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_y1XpGNYX.mjs';
import 'piccolore';
import { $ as $$DashboardLayout } from '../chunks/DashboardLayout_CgAasVuI.mjs';
export { renderers } from '../renderers.mjs';

const $$Orchestration = createComponent(($$result, $$props, $$slots) => {
  const orders = [
    { id: "#CMD-005", date: "\xC0 l'instant", agent: "CHEF_TECHNIQUE", target: "DEV_FRONTEND", task: "Int\xE9gration du Menu Hamburger Preact Mobile (Responsive)", status: "Termin\xE9" },
    { id: "#CMD-004", date: "Il y a 2 minutes", agent: "CHEF_TECHNIQUE", target: "DEV_FRONTEND", task: "Rendre le site responsive (flex-col md:flex-row)", status: "Termin\xE9" },
    { id: "#CMD-003", date: "Il y a 5 minutes", agent: "CHEF_TECHNIQUE", target: "DEV_BACKEND", task: "Cr\xE9er l'API /api/agents pour les statistiques temps r\xE9el", status: "Termin\xE9" },
    { id: "#CMD-002", date: "Il y a 10 minutes", agent: "CHEF_TECHNIQUE", target: "EXPERT_GITHUB", task: "Cr\xE9er le d\xE9p\xF4t Forge et pousser la branche main", status: "Termin\xE9" },
    { id: "#CMD-001", date: "Il y a 45 minutes", agent: "Mathieu (Humain)", target: "CHEF_TECHNIQUE", task: "CREATE_NEW_APP saas-billing", status: "Termin\xE9" }
  ];
  return renderTemplate`${renderComponent($$result, "DashboardLayout", $$DashboardLayout, { "title": "Orchestration", "currentPath": "/orchestration" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="max-w-7xl mx-auto"> <h2 class="text-2xl font-bold text-white mb-2">Historique des Commandes</h2> <p class="text-slate-400 mb-8">Journal des ordres émis par le Chef Technique et exécutés par l'essaim.</p> <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden"> <table class="w-full text-left text-sm text-slate-300"> <thead class="bg-slate-800/50 text-xs uppercase text-slate-500 border-b border-slate-800"> <tr> <th class="px-6 py-4 font-medium">Ordre</th> <th class="px-6 py-4 font-medium">Émetteur -> Cible</th> <th class="px-6 py-4 font-medium">Tâche</th> <th class="px-6 py-4 font-medium">Statut</th> </tr> </thead> <tbody class="divide-y divide-slate-800/50"> ${orders.map((order) => renderTemplate`<tr class="hover:bg-slate-800/20 transition"> <td class="px-6 py-4"> <span class="font-mono text-xs text-blue-400">${order.id}</span> <div class="text-xs text-slate-500 mt-1">${order.date}</div> </td> <td class="px-6 py-4"> <div class="flex items-center gap-2"> <span class="px-2 py-1 bg-slate-800 rounded text-xs">${order.agent}</span> <svg class="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path></svg> <span class="px-2 py-1 bg-slate-800 rounded text-xs text-emerald-400">${order.target}</span> </div> </td> <td class="px-6 py-4 text-slate-300">${order.task}</td> <td class="px-6 py-4"> <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"> <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> ${order.status} </span> </td> </tr>`)} </tbody> </table> </div> </div> ` })}`;
}, "/media/Github/Forge/dashboard/src/pages/orchestration.astro", void 0);

const $$file = "/media/Github/Forge/dashboard/src/pages/orchestration.astro";
const $$url = "/orchestration";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Orchestration,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
