import { useState } from 'preact/hooks';
import { jsxs, jsx } from 'preact/jsx-runtime';

function AgentStats({
  agents
}) {
  const [search, setSearch] = useState("");
  const filtered = agents.filter((a) => a.toLowerCase().includes(search.toLowerCase()));
  return jsxs("div", {
    class: "bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-full max-h-[400px]",
    children: [jsxs("div", {
      class: "p-5 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900 z-10 rounded-t-xl",
      children: [jsxs("h3", {
        class: "font-bold text-white flex items-center gap-2 text-sm tracking-tight",
        children: [jsx("svg", {
          class: "w-4 h-4 text-purple-400",
          fill: "none",
          viewBox: "0 0 24 24",
          stroke: "currentColor",
          children: jsx("path", {
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            "stroke-width": "2",
            d: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          })
        }), "Activité de l'Essaim"]
      }), jsxs("span", {
        class: "bg-slate-800 text-xs text-slate-400 px-2.5 py-1 rounded-full border border-slate-700 font-medium",
        children: [agents.length, " Actifs"]
      })]
    }), jsx("div", {
      class: "px-5 pt-4 pb-2",
      children: jsxs("div", {
        class: "relative",
        children: [jsx("svg", {
          class: "absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500",
          fill: "none",
          viewBox: "0 0 24 24",
          stroke: "currentColor",
          children: jsx("path", {
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            "stroke-width": "2",
            d: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          })
        }), jsx("input", {
          type: "text",
          placeholder: "Rechercher un agent...",
          value: search,
          onInput: (e) => setSearch(e.target.value),
          class: "w-full bg-slate-950 border border-slate-800 text-xs rounded-md pl-8 pr-3 py-1.5 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 transition outline-none"
        })]
      })
    }), jsxs("div", {
      class: "flex-1 overflow-y-auto px-5 pb-5 space-y-3 mt-2 custom-scrollbar",
      children: [filtered.map((agent) => jsxs("div", {
        class: "flex items-center justify-between group",
        children: [jsxs("div", {
          class: "flex items-center gap-2.5",
          children: [jsxs("div", {
            class: "relative flex h-2 w-2",
            children: [jsx("span", {
              class: "animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"
            }), jsx("span", {
              class: "relative inline-flex rounded-full h-2 w-2 bg-emerald-500"
            })]
          }), jsx("span", {
            class: "text-xs font-mono text-slate-300 group-hover:text-white transition cursor-default",
            children: agent
          })]
        }), jsx("span", {
          class: "text-[10px] uppercase font-semibold tracking-wider text-slate-500 bg-slate-950 px-2 py-0.5 rounded border border-slate-800",
          children: "Prêt"
        })]
      }, agent)), filtered.length === 0 && jsx("div", {
        class: "text-center text-xs text-slate-500 py-4",
        children: "Aucun agent trouvé"
      })]
    })]
  });
}

export { AgentStats as A };
