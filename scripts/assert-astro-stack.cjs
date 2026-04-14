"use strict";

/**
 * Évite un node_modules incohérent (ex. @astrojs/node 9.x avec astro 6.x),
 * source d’avertissements « default » / entrypointResolution et de builds fragiles.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

const nodeAdapterPkg = path.join(
  root,
  "node_modules",
  "@astrojs",
  "node",
  "package.json"
);
const astroPkg = path.join(root, "node_modules", "astro", "package.json");

if (!fs.existsSync(nodeAdapterPkg) || !fs.existsSync(astroPkg)) {
  process.exit(0);
}

const node = readJson(nodeAdapterPkg);
const astro = readJson(astroPkg);
const nodeMajor = Number(String(node.version).split(".")[0]);
const astroMajor = Number(String(astro.version).split(".")[0]);

if (astroMajor !== 6) {
  process.exit(0);
}

if (nodeMajor >= 10) {
  process.exit(0);
}

console.error("");
console.error(
  "[forge] Versions incohérentes : @astrojs/node=" +
    node.version +
    " (attendu >= 10 pour astro 6), astro=" +
    astro.version +
    "."
);
console.error(
  "[forge] Le lockfile peut être correct mais node_modules est désaligné (copie NAS, install partielle)."
);
console.error(
  "[forge] Corrigez avec : supprimez node_modules puis npm ci   (ou npm install @astrojs/node@10)"
);
console.error("");
process.exit(1);
