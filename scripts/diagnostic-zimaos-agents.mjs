#!/usr/bin/env node
/**
 * Diagnostic + auto-correction des permissions agents/subagents ZimaOS.
 *
 * Usage:
 *   node scripts/diagnostic-zimaos-agents.mjs
 *   node scripts/diagnostic-zimaos-agents.mjs --fix
 *   node scripts/diagnostic-zimaos-agents.mjs --file /DATA/AppData/zimaos/zimaos.json --fix
 */

import fs from "node:fs";
import path from "node:path";

const args = new Set(process.argv.slice(2));

function readArgValue(flag, fallback = null) {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= argv.length) return fallback;
  return argv[idx + 1];
}

const explicitFile = readArgValue("--file");
const fix = args.has("--fix");

const candidatePaths = [
  explicitFile,
  process.env.ZIMAOS_CONFIG,
  process.env.ZIMAOS_DATA ? path.join(process.env.ZIMAOS_DATA, "zimaos.json") : null,
  "X:/AppData/zimaos/zimaos.json",
  "/DATA/AppData/zimaos/zimaos.json",
  "/home/node/.zimaos/zimaos.json",
].filter(Boolean);

function firstExistingFile(paths) {
  for (const p of paths) {
    try {
      if (fs.statSync(p).isFile()) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

function dedupeUpper(values) {
  const set = new Set();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const clean = value.trim();
    if (!clean) continue;
    set.add(clean.toUpperCase());
  }
  return [...set];
}

function ensureObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

const configPath = firstExistingFile(candidatePaths);
if (!configPath) {
  console.error("ERREUR: impossible de localiser zimaos.json");
  console.error("Chemins testés:");
  for (const p of candidatePaths) console.error(`- ${p}`);
  process.exit(1);
}

const raw = fs.readFileSync(configPath, "utf8");
let config;
try {
  config = JSON.parse(raw);
} catch (error) {
  console.error(`ERREUR: JSON invalide dans ${configPath}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const agentsRoot = ensureObject(config.agents);
const defaults = ensureObject(agentsRoot.defaults);
const defaultSubagents = ensureObject(defaults.subagents);
const list = Array.isArray(agentsRoot.list) ? agentsRoot.list : [];
const agentIds = dedupeUpper(list.map((agent) => agent?.id));

const diagnostics = [];
const updates = [];

if (agentIds.length === 0) {
  diagnostics.push("Aucun agent trouvé dans agents.list.");
}

const maxSpawnDepth = Number(defaultSubagents.maxSpawnDepth ?? 1);
if (!Number.isFinite(maxSpawnDepth) || maxSpawnDepth < 2) {
  diagnostics.push(
    `agents.defaults.subagents.maxSpawnDepth=${String(
      defaultSubagents.maxSpawnDepth ?? "(absent)",
    )} bloque l'orchestration multiniveau (attendu >= 2).`,
  );
  if (fix) {
    defaultSubagents.maxSpawnDepth = 2;
    updates.push("maxSpawnDepth défini à 2.");
  }
}

for (let i = 0; i < list.length; i += 1) {
  const agent = ensureObject(list[i]);
  const id = typeof agent.id === "string" ? agent.id.toUpperCase() : `#${i}`;

  const subagents = ensureObject(agent.subagents);
  const allowAgentsRaw = Array.isArray(subagents.allowAgents) ? subagents.allowAgents : [];
  const allowAgents = dedupeUpper(allowAgentsRaw);
  const hasWildcard = allowAgents.includes("*");
  const allowsAllByList = agentIds.every((agentId) => allowAgents.includes(agentId));

  if (!hasWildcard && !allowsAllByList) {
    diagnostics.push(
      `Agent ${id}: allowAgents incomplet/absent (actuel: ${
        allowAgents.length > 0 ? allowAgents.join(", ") : "none"
      }).`,
    );
    if (fix) {
      subagents.allowAgents = ["*"];
      list[i] = { ...agent, subagents };
      updates.push(`Agent ${id}: subagents.allowAgents -> [\"*\"].`);
    }
  }
}

const header = "=== Diagnostic autorisations ZimaOS (agents/subagents) ===";
console.log(header);
console.log(`Fichier: ${configPath}`);
console.log(`Agents détectés (${agentIds.length}): ${agentIds.join(", ") || "none"}`);
console.log("");

if (diagnostics.length === 0) {
  console.log("OK: aucune anomalie détectée.");
} else {
  console.log("Anomalies détectées:");
  for (const issue of diagnostics) console.log(`- ${issue}`);
}

if (!fix) {
  console.log("");
  console.log("Mode lecture seule. Pour corriger automatiquement:");
  console.log(`node "${path.normalize(process.argv[1])}" --fix --file "${configPath}"`);
  process.exit(diagnostics.length === 0 ? 0 : 2);
}

if (updates.length === 0) {
  console.log("");
  console.log("Aucune modification à écrire.");
  process.exit(0);
}

config.agents = {
  ...agentsRoot,
  defaults: {
    ...defaults,
    subagents: defaultSubagents,
  },
  list,
};

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = `${configPath}.bak-${stamp}`;
fs.copyFileSync(configPath, backupPath);
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

console.log("");
console.log("Corrections appliquées:");
for (const update of updates) console.log(`- ${update}`);
console.log(`Backup: ${backupPath}`);
console.log("");
console.log("Action recommandée: redémarrer la gateway ZimaOS.");
