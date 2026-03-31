/* empty css                                */
import { e as createComponent, k as renderComponent, r as renderTemplate, h as createAstro, m as maybeRenderHead } from '../chunks/astro/server_y1XpGNYX.mjs';
import 'piccolore';
import { $ as $$DashboardLayout } from '../chunks/DashboardLayout_CgAasVuI.mjs';
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro();
const $$Reports = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Reports;
  const reportV1 = `# Rapport de Qualification (TESTEUR_QA) - v1.0.0
**Date :** 31 Mars 2026
**Cible :** Forge SaaS Dashboard
**Statut Global :** VALID\xC9 \u2705

## 1. Audit Frontend
- Build SSR Astro: SUCCESS
- Hot Reloading (Vite): SUCCESS
- Accessibilit\xE9 (ARIA): PASS`;
  const reportV2 = `# Rapport de Qualification (TESTEUR_QA + ANALYSTE_CODE) - v1.1.0
## Nouvelles Anomalies D\xE9tect\xE9es
1. **Responsivit\xE9 (CRITIQUE)** : 
   - La page / d\xE9borde sur mobile. Le Hero section n'est pas flex-wrap.
2. **Fonctionnalit\xE9s Manquantes (\xC9VOLUTION)** :
   - Les "Param\xE8tres ZimaOS" /settings affichent juste le menu gauche sans contenu principal.

## Actions Requises pour le DEV_FRONTEND
- Ajouter flex-wrap ou corriger les max-w sur mobile.
- Cr\xE9er les vues r\xE9elles pour /swarm et /settings.`;
  return renderTemplate`${renderComponent($$result, "DashboardLayout", $$DashboardLayout, { "title": "Rapports d'Agents", "currentPath": "/reports" }, { "default": ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="max-w-7xl mx-auto"> <h2 class="text-2xl font-bold text-white mb-2">Audits et Rapports de l'Essaim</h2> <p class="text-slate-400 mb-8">Retrouvez ici les analyses de code, les tests QA et les audits de sécurité générés par vos agents.</p> <div class="grid grid-cols-1 lg:grid-cols-2 gap-6"> <div class="bg-slate-900 border border-slate-800 rounded-xl p-6"> <div class="flex justify-between items-center mb-4 pb-4 border-b border-slate-800"> <div class="flex items-center gap-2"> <svg class="w-5 h-5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg> <h3 class="font-bold text-white">Audit Responsif v1.1.0</h3> </div> <span class="text-xs text-slate-500">Par TESTEUR_QA & ANALYSTE_CODE</span> </div> <div class="prose prose-invert prose-sm max-w-none text-slate-300 font-mono text-xs whitespace-pre-wrap"> ${reportV2} </div> <div class="mt-4 pt-4 border-t border-slate-800 flex justify-end"> <button class="text-xs bg-blue-600/20 text-blue-400 px-3 py-1.5 rounded hover:bg-blue-600/30 transition border border-blue-500/20">Assigner Correction -> DEV_FRONTEND</button> </div> </div> <div class="bg-slate-900 border border-slate-800 rounded-xl p-6"> <div class="flex justify-between items-center mb-4 pb-4 border-b border-slate-800"> <div class="flex items-center gap-2"> <svg class="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg> <h3 class="font-bold text-white">Validation Initiale v1.0.0</h3> </div> <span class="text-xs text-slate-500">Par TESTEUR_QA</span> </div> <div class="prose prose-invert prose-sm max-w-none text-slate-300 font-mono text-xs whitespace-pre-wrap"> ${reportV1} </div> </div> </div> </div> ` })}`;
}, "/media/Github/Forge/dashboard/src/pages/reports.astro", void 0);

const $$file = "/media/Github/Forge/dashboard/src/pages/reports.astro";
const $$url = "/reports";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Reports,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
