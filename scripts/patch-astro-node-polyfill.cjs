"use strict";

/**
 * @astrojs/node/dist/polyfill.js importe encore `applyPolyfills` depuis `astro/app/node`,
 * alors qu’astro@6.1.x publié sur npm ne l’exporte plus → échec Rollup au build.
 * Remplacement par un module ESM vide (no-op). Idempotent.
 *
 * À retirer quand une version alignée Astro + @astrojs/node corrige ça en amont.
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const adapterPkg = path.join(root, "node_modules", "@astrojs", "node", "package.json");
if (fs.existsSync(adapterPkg)) {
  const { version } = JSON.parse(fs.readFileSync(adapterPkg, "utf8"));
  if (String(version).startsWith("10.")) {
    process.exit(0);
  }
}

const target = path.join(
  root,
  "node_modules",
  "@astrojs",
  "node",
  "dist",
  "polyfill.js"
);

if (!fs.existsSync(target)) {
  process.exit(0);
}

const marker = "FORGE_PATCH_NO_APPLY_POLYFILLS";
const cur = fs.readFileSync(target, "utf8");
if (cur.includes(marker)) {
  process.exit(0);
}

const next = `// ${marker}
// Astro 6.1.x : "applyPolyfills" absent de astro/app/node — shim no-op pour le build.
export {};
`;
fs.writeFileSync(target, next, "utf8");
console.log("[forge] Patch @astrojs/node/dist/polyfill.js (applyPolyfills)");
