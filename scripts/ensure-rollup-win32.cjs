"use strict";

/**
 * Contournement du bug npm sur les optionalDependencies (Rollup natif Windows).
 * https://github.com/npm/cli/issues/4828
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

if (process.platform !== "win32" || process.arch !== "x64") {
  process.exit(0);
}

const root = path.join(__dirname, "..");
const rollupJson = path.join(root, "node_modules", "rollup", "package.json");
if (!fs.existsSync(rollupJson)) {
  process.exit(0);
}

const { version } = require(rollupJson);
const nativePkg = path.join(
  root,
  "node_modules",
  "@rollup",
  "rollup-win32-x64-msvc",
  "package.json"
);
if (fs.existsSync(nativePkg)) {
  process.exit(0);
}

console.log(
  `[forge] Installation de @rollup/rollup-win32-x64-msvc@${version} (contournement npm optional deps)`
);
execSync(
  `npm install --no-fund --no-audit --ignore-scripts --install-strategy=nested @rollup/rollup-win32-x64-msvc@${version}`,
  {
    cwd: root,
    stdio: "inherit",
    shell: true,
  }
);
