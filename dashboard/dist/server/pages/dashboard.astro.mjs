/* empty css                                     */
import { e as createComponent, k as renderHead, g as addAttribute, r as renderTemplate, l as renderComponent } from '../chunks/astro/server_DJLMGM8A.mjs';
import 'piccolore';
import { useState, useEffect } from 'preact/hooks';
import { jsxs, jsx, Fragment } from 'preact/jsx-runtime';
export { renderers } from '../renderers.mjs';

function AppLauncher() {
  const [name, setName] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const createApp = async () => {
    if (!name.trim()) {
      setStatus("Nom invalide");
      return;
    }
    setLoading(true);
    setStatus("Création en cours...");
    try {
      const res = await fetch("/api/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || "Erreur lors de la création");
      } else {
        setStatus(`Ordre envoyé ! L'agent CHEF_TECHNIQUE s'occupe de ${data.app}.`);
        setName("");
      }
    } catch (err) {
      setStatus("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  };
  return jsxs("div", {
    class: "relative z-10 flex flex-col h-full",
    children: [jsxs("div", {
      class: "flex items-center gap-2 mb-4",
      children: [jsx("svg", {
        class: "w-5 h-5 text-blue-500",
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
        children: jsx("path", {
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          "stroke-width": "2",
          d: "M13 10V3L4 14h7v7l9-11h-7z"
        })
      }), jsx("h3", {
        class: "font-bold text-white tracking-tight",
        children: "Nouvelle Application"
      })]
    }), jsx("p", {
      class: "text-sm text-slate-400 mb-6",
      children: "Lancez un ordre à l'essaim pour générer, configurer et déployer une nouvelle app ZimaOS."
    }), jsxs("div", {
      class: "mt-auto",
      children: [jsxs("div", {
        class: "relative flex items-center mb-3",
        children: [jsx("div", {
          class: "absolute left-3 text-slate-500",
          children: jsx("svg", {
            class: "w-4 h-4",
            fill: "none",
            viewBox: "0 0 24 24",
            stroke: "currentColor",
            children: jsx("path", {
              "stroke-linecap": "round",
              "stroke-linejoin": "round",
              "stroke-width": "2",
              d: "M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
            })
          })
        }), jsx("input", {
          type: "text",
          value: name,
          onInput: (e) => setName(e.target.value),
          placeholder: "Nom de l'application...",
          class: "w-full bg-slate-950/50 border border-slate-700/50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 pl-9 pr-3 py-2.5 rounded-lg text-sm transition outline-none",
          disabled: loading
        })]
      }), jsx("button", {
        onClick: createApp,
        disabled: loading || !name.trim(),
        class: `w-full py-2.5 rounded-lg font-semibold text-sm transition shadow-lg flex items-center justify-center gap-2
            ${loading || !name.trim() ? "bg-slate-800 text-slate-500 cursor-not-allowed shadow-none border border-slate-700" : "bg-blue-600 text-white hover:bg-blue-500 shadow-blue-500/20"}`,
        children: loading ? jsxs("span", {
          class: "flex items-center gap-2",
          children: [jsxs("svg", {
            class: "animate-spin -ml-1 mr-2 h-4 w-4 text-white",
            fill: "none",
            viewBox: "0 0 24 24",
            children: [jsx("circle", {
              class: "opacity-25",
              cx: "12",
              cy: "12",
              r: "10",
              stroke: "currentColor",
              "stroke-width": "4"
            }), jsx("path", {
              class: "opacity-75",
              fill: "currentColor",
              d: "M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            })]
          }), "Lancement..."]
        }) : jsxs(Fragment, {
          children: [jsx("svg", {
            class: "w-4 h-4",
            fill: "none",
            viewBox: "0 0 24 24",
            stroke: "currentColor",
            children: jsx("path", {
              "stroke-linecap": "round",
              "stroke-linejoin": "round",
              "stroke-width": "2",
              d: "M14 5l7 7m0 0l-7 7m7-7H3"
            })
          }), "LANCER LA FORGE"]
        })
      }), status && jsx("div", {
        class: `text-xs mt-4 p-3 rounded bg-slate-950/50 border ${status.includes("Erreur") ? "border-red-500/30 text-red-400" : "border-blue-500/30 text-blue-400"}`,
        children: jsxs("div", {
          class: "flex items-start gap-2",
          children: [jsx("svg", {
            class: "w-4 h-4 mt-0.5 shrink-0",
            fill: "none",
            viewBox: "0 0 24 24",
            stroke: "currentColor",
            children: jsx("path", {
              "stroke-linecap": "round",
              "stroke-linejoin": "round",
              "stroke-width": "2",
              d: "M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            })
          }), jsx("span", {
            children: status
          })]
        })
      })]
    })]
  });
}

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

const initialLines = ["[CHEF_TECHNIQUE] Initialisation de la Forge... OK", "[SYSTEME] Daemon OpenClaw connecté.", "[OLLAMA] Modèle qwen2.5:32b chargé avec succès (VRAM OK).", "[GITHUB] Auth CLI validée (mathieu@forge).", "[ARCHITECTE_LOGICIEL] Structure des agents synchronisée.", "[INFRA_TECH] Daemon Docker ZimaOS joignable.", "[ROUTINE] Scan de /media/GitHub... 4 dépôts trouvés."];
function WireLogs() {
  const [lines, setLines] = useState(initialLines);
  useEffect(() => {
    const timer = setInterval(() => {
      const mockEvents = ["[VEILLE_TECH] Vérification des dépendances NPM terminées.", "[MAINTENANCE_REPO] Aucune PR en attente.", "[TESTEUR_QA] Scan qualité des répertoires en cours...", "[SECURITE_CODE] Audit de tesla.forge.local terminé. 0 faille.", "[CHEF_TECHNIQUE] En attente de nouvelles instructions."];
      if (Math.random() > 0.7) {
        setLines((prev) => [...prev.slice(-15), mockEvents[Math.floor(Math.random() * mockEvents.length)]]);
      }
    }, 4e3);
    return () => clearInterval(timer);
  }, []);
  return jsxs("div", {
    class: "bg-slate-950 rounded-xl border border-slate-800 shadow-xl overflow-hidden flex flex-col h-[300px]",
    children: [jsxs("div", {
      class: "flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800",
      children: [jsxs("div", {
        class: "flex items-center gap-2",
        children: [jsx("svg", {
          class: "w-4 h-4 text-slate-400",
          fill: "none",
          viewBox: "0 0 24 24",
          stroke: "currentColor",
          children: jsx("path", {
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            "stroke-width": "2",
            d: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
          })
        }), jsx("h2", {
          class: "text-xs font-semibold tracking-wider text-slate-300 uppercase",
          children: "The Wire - Flux Temps Réel"
        })]
      }), jsxs("div", {
        class: "flex gap-1.5",
        children: [jsx("div", {
          class: "w-2.5 h-2.5 rounded-full bg-slate-700"
        }), jsx("div", {
          class: "w-2.5 h-2.5 rounded-full bg-slate-700"
        }), jsx("div", {
          class: "w-2.5 h-2.5 rounded-full bg-slate-700"
        })]
      })]
    }), jsx("div", {
      class: "flex-1 p-4 font-mono text-[11px] overflow-y-auto bg-[#0A0D14] text-slate-300 custom-scrollbar flex flex-col gap-1.5",
      children: lines.map((line, i) => {
        let colorClass = "text-slate-400";
        if (line.includes("[CHEF_TECHNIQUE]")) colorClass = "text-blue-400";
        if (line.includes("[OLLAMA]")) colorClass = "text-emerald-400";
        if (line.includes("[GITHUB]")) colorClass = "text-purple-400";
        if (line.includes("[SECURITE_CODE]")) colorClass = "text-red-400";
        if (line.includes("OK") || line.includes("succès")) colorClass = "text-emerald-400";
        return jsxs("div", {
          class: "flex items-start gap-3 hover:bg-slate-800/50 px-2 py-0.5 rounded transition",
          children: [jsx("span", {
            class: "text-slate-600 shrink-0 select-none",
            children: (/* @__PURE__ */ new Date()).toLocaleTimeString("fr-FR", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit"
            })
          }), jsx("span", {
            class: `${colorClass} break-words`,
            children: line
          })]
        }, i);
      })
    })]
  });
}

const $$Dashboard = createComponent(($$result, $$props, $$slots) => {
  const vram = 65;
  const agents = [
    "CHEF_TECHNIQUE",
    "ARCHITECTE_LOGICIEL",
    "DEV_BACKEND",
    "DEV_FRONTEND",
    "EXPERT_GITHUB",
    "ANALYSTE_CODE",
    "TESTEUR_QA",
    "INFRA_TECH",
    "REDACTEUR_DOC",
    "VEILLE_TECH",
    "SECURITE_CODE",
    "SCRIPTEUR_AUTOMATE",
    "INGENIEUR_PROMPT",
    "INGENIEUR_HARDWARE",
    "MAINTENANCE_REPO"
  ];
  const deployedApps = [
    { name: "tesla", status: "Online", lastDeploy: "2h ago", url: "tesla.forge.local" },
    { name: "ZimaOS-MCP", status: "Building", lastDeploy: "5m ago", url: "mcp.forge.local" },
    { name: "mcp-turso", status: "Online", lastDeploy: "1d ago", url: "turso.forge.local" },
    { name: "popcorn", status: "Offline", lastDeploy: "3d ago", url: "popcorn.forge.local" }
  ];
  return renderTemplate`<html lang="fr" class="h-full bg-slate-950"> <head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Dashboard | DevForge SaaS</title>${renderHead()}</head> <body class="flex h-full bg-slate-950 text-white font-sans antialiased overflow-hidden selection:bg-blue-500/30"> <!-- Sidebar --> <aside class="flex w-64 flex-col bg-slate-900 border-r border-white/5 h-full relative z-20 shadow-2xl"> <div class="flex h-16 shrink-0 items-center px-6 border-b border-white/5"> <div class="flex items-center gap-2 cursor-pointer" onclick="window.location.href='/'"> <div class="h-8 w-8 rounded bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-lg shadow-lg shadow-blue-500/20">F</div> <span class="text-xl font-bold tracking-tight text-white">DevForge</span> </div> </div> <nav class="flex flex-1 flex-col px-4 py-6 overflow-y-auto"> <div class="space-y-1"> <a href="#" class="bg-blue-500/10 text-blue-400 group flex items-center rounded-md px-3 py-2 text-sm font-medium border border-blue-500/20"> <svg class="mr-3 h-5 w-5 flex-shrink-0 text-blue-400" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25"></path></svg>
Vue d'ensemble
</a> <a href="#" class="text-slate-400 hover:bg-slate-800 hover:text-white group flex items-center rounded-md px-3 py-2 text-sm font-medium transition"> <svg class="mr-3 h-5 w-5 flex-shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M20.25 14.15v4.25c0 1.036-.84 1.875-1.875 1.875H5.625a1.875 1.875 0 01-1.875-1.875v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z"></path></svg>
Applications
</a> <a href="#" class="text-slate-400 hover:bg-slate-800 hover:text-white group flex items-center rounded-md px-3 py-2 text-sm font-medium transition"> <svg class="mr-3 h-5 w-5 flex-shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"></path></svg>
Essaim d'Agents
</a> <a href="#" class="text-slate-400 hover:bg-slate-800 hover:text-white group flex items-center rounded-md px-3 py-2 text-sm font-medium transition"> <svg class="mr-3 h-5 w-5 flex-shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z"></path><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
Paramètres ZimaOS
</a> </div> <div class="mt-8"> <h3 class="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Ressources Systèmes</h3> <div class="mt-4 px-3 space-y-4"> <div> <div class="flex items-center justify-between text-xs text-slate-400 mb-1"> <span>VRAM Usage</span> <span>${vram}%</span> </div> <div class="h-2 w-full bg-slate-800 rounded-full overflow-hidden"> <div class="h-full bg-blue-500 rounded-full"${addAttribute(`width: ${vram}%`, "style")}></div> </div> </div> <div> <div class="flex items-center justify-between text-xs text-slate-400 mb-1"> <span>Charge GPU</span> <span>42%</span> </div> <div class="h-2 w-full bg-slate-800 rounded-full overflow-hidden"> <div class="h-full bg-indigo-500 rounded-full" style="width: 42%"></div> </div> </div> </div> </div> </nav> <!-- User profile bottom --> <div class="border-t border-white/5 p-4 flex items-center gap-3"> <div class="h-9 w-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-sm text-slate-300">
M
</div> <div class="flex flex-col"> <span class="text-sm font-semibold text-white">Mathieu</span> <span class="text-xs text-slate-500">Administrateur</span> </div> </div> </aside> <!-- Main View --> <main class="flex-1 flex flex-col h-full bg-slate-950 relative overflow-hidden"> <div class="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5 mix-blend-overlay pointer-events-none"></div> <!-- Top header --> <header class="h-16 flex items-center justify-between px-8 border-b border-white/5 bg-slate-950/50 backdrop-blur z-10"> <h1 class="text-lg font-semibold text-white">Vue d'ensemble de la Forge</h1> <div class="flex items-center gap-4"> <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]"> <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
Ollama (qwen2.5:32b) Connecté
</span> <button class="bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm py-1.5 px-4 rounded-md transition font-medium">Déconnexion</button> </div> </header> <!-- Content --> <div class="flex-1 overflow-y-auto p-8 z-10"> <div class="max-w-7xl mx-auto space-y-8"> <div class="flex items-end justify-between"> <div> <h2 class="text-2xl font-bold tracking-tight text-white">Vos Applications</h2> <p class="mt-1 text-sm text-slate-400">Applications gérées et déployées par les agents DevForge.</p> </div> </div> <div class="grid grid-cols-1 lg:grid-cols-3 gap-6"> <!-- Left col: Project List & App Launcher --> <div class="lg:col-span-2 flex flex-col gap-6"> <!-- Projects Grid --> <div class="grid grid-cols-1 md:grid-cols-2 gap-4"> ${deployedApps.map((app) => renderTemplate`<div class="bg-slate-900 border border-slate-800 rounded-xl p-5 hover:border-blue-500/50 transition cursor-pointer group shadow-sm hover:shadow-lg"> <div class="flex justify-between items-start mb-4"> <div class="flex items-center gap-3"> <div${addAttribute(`h-10 w-10 rounded-lg flex items-center justify-center font-bold text-lg border
                          ${app.status === "Online" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : app.status === "Building" ? "bg-blue-500/10 text-blue-400 border-blue-500/20" : "bg-slate-800 text-slate-400 border-slate-700"}`, "class")}> ${app.name.charAt(0).toUpperCase()} </div> <div> <h3 class="font-semibold text-white group-hover:text-blue-400 transition">${app.name}</h3> <a${addAttribute(`http://${app.url}`, "href")} target="_blank" class="text-xs text-slate-400 hover:text-slate-300 transition">${app.url}</a> </div> </div> <span${addAttribute(`text-xs px-2 py-1 rounded-full border
                        ${app.status === "Online" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : app.status === "Building" ? "bg-blue-500/10 text-blue-400 border-blue-500/20 animate-pulse" : "bg-slate-800 text-slate-400 border-slate-700"}`, "class")}> ${app.status} </span> </div> <div class="flex items-center text-xs text-slate-500"> <svg class="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"> <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path> </svg>
Dernier déploiement: ${app.lastDeploy} </div> </div>`)} </div> <!-- Wire Logs (Console feeling) --> <div class="mt-4"> ${renderComponent($$result, "WireLogs", WireLogs, { "client:load": true, "client:component-hydration": "load", "client:component-path": "/media/Github/Forge/dashboard/src/components/WireLogs", "client:component-export": "default" })} </div> </div> <!-- Right col: Actions & Agents --> <div class="space-y-6"> <!-- App Launcher Tool --> <div class="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 shadow-xl rounded-xl p-[1px]"> <div class="bg-slate-900 rounded-xl p-5 h-full relative overflow-hidden"> <div class="absolute -right-10 -top-10 w-32 h-32 bg-blue-600/20 rounded-full blur-[40px]"></div> ${renderComponent($$result, "AppLauncher", AppLauncher, { "client:load": true, "client:component-hydration": "load", "client:component-path": "/media/Github/Forge/dashboard/src/components/AppLauncher", "client:component-export": "default" })} </div> </div> <!-- Agents status list --> ${renderComponent($$result, "AgentStats", AgentStats, { "agents": agents, "client:load": true, "client:component-hydration": "load", "client:component-path": "/media/Github/Forge/dashboard/src/components/AgentStats", "client:component-export": "default" })} </div> </div> </div> </div> </main> </body></html>`;
}, "/media/Github/Forge/dashboard/src/pages/dashboard.astro", void 0);

const $$file = "/media/Github/Forge/dashboard/src/pages/dashboard.astro";
const $$url = "/dashboard";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Dashboard,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
