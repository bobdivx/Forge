import { useState, useEffect } from 'preact/hooks';
import { jsxs, jsx, Fragment } from 'preact/jsx-runtime';

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

export { AppLauncher as A, WireLogs as W };
