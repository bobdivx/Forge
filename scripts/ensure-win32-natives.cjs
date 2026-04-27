"use strict";

/**
 * Installe les binaires natifs Windows manquants sans `npm install` dans le dépôt
 * (évite le nettoyage agressif de npm sur lecteurs réseau → EPERM / node_modules cassé).
 *
 * - @rollup/rollup-win32-x64-msvc (même version que node_modules/rollup)
 * - @libsql/win32-x64-msvc (optionalDependencies de node_modules/libsql)
 * - @esbuild/win32-* : pour CHAQUE copie d'esbuild (racine, astro/node_modules, etc.),
 *   binaire placé dans le node_modules parent de ce esbuild (sinon conflit de version
 *   « Host 0.27.4 does not match binary 0.25.12 »).
 *
 * Voir aussi https://github.com/npm/cli/issues/4828
 */
const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

if (process.platform !== "win32" || process.arch !== "x64") {
  process.exit(0);
}

const root = path.join(__dirname, "..");

/** @param {string} scopedName @param {string} nodeModulesDir répertoire …/node_modules contenant @scope */
function destForScopedIn(scopedName, nodeModulesDir) {
  const m = scopedName.match(/^(@[^/]+)\/(.+)$/);
  if (!m) throw new Error(`Nom de paquet invalide: ${scopedName}`);
  return path.join(nodeModulesDir, m[1], m[2]);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

/**
 * @param {string} scopedName
 * @param {string} version
 * @param {string} nodeModulesDir parent direct du paquet « esbuild » (…/node_modules)
 * @param {{ force?: boolean, isReady?: (dest: string) => boolean }} opts isReady optionnel (ex. binaire .exe / .node)
 */
function installFromPackInto(scopedName, version, nodeModulesDir, opts) {
  const force = opts && opts.force;
  const isReady = opts && opts.isReady;
  const dest = destForScopedIn(scopedName, nodeModulesDir);
  const marker = path.join(dest, "package.json");
  if (!force && fs.existsSync(marker)) {
    let installed = null;
    try {
      installed = readJson(marker).version;
    } catch {
      /* ignore */
    }
    const versionOk = installed === version;
    const extraOk = !isReady || isReady(dest);
    if (versionOk && extraOk) {
      return;
    }
  }
  console.log(
    `[forge] ${scopedName}@${version} → ${path.relative(root, dest)} (npm pack, hors lecteur réseau)`
  );
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "forge-native-"));
  try {
    execSync(`npm pack "${scopedName}@${version}"`, {
      cwd: tmp,
      stdio: "inherit",
      shell: true,
    });
    const tgz = fs.readdirSync(tmp).find((f) => f.endsWith(".tgz"));
    if (!tgz) {
      throw new Error("npm pack: aucun fichier .tgz produit");
    }
    execSync(`tar -xzf "${path.join(tmp, tgz)}"`, {
      cwd: tmp,
      stdio: "inherit",
      shell: true,
    });
    const extracted = path.join(tmp, "package");
    if (!fs.existsSync(extracted)) {
      throw new Error("npm pack: dossier package/ absent après extraction");
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(extracted, dest, { recursive: true });
    console.log(`[forge] OK : ${dest}`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** Racine …/node_modules où vit rollup / libsql (dépôt) */
function installFromPackRoot(scopedName, version, opts) {
  installFromPackInto(scopedName, version, path.join(root, "node_modules"), opts);
}

function addEsbuildDir(out, seen, dir) {
  const pkg = path.join(dir, "package.json");
  if (seen.has(dir) || !fs.existsSync(pkg)) return;
  try {
    if (readJson(pkg).name === "esbuild") {
      seen.add(dir);
      out.push(dir);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Vérifie uniquement les copies réellement utilisées par le stack Forge.
 * Un scan récursif ou une lecture exhaustive du lockfile peut bloquer longtemps
 * sur lecteur réseau.
 * @param {string[]} out
 */
function collectKnownEsbuildDirs(out) {
  const seen = new Set();
  addEsbuildDir(out, seen, path.join(root, "node_modules", "esbuild"));
  addEsbuildDir(out, seen, path.join(root, "node_modules", "astro", "node_modules", "esbuild"));
  addEsbuildDir(out, seen, path.join(root, "node_modules", "@astrojs", "vercel", "node_modules", "esbuild"));
}

function esbuildNativePackageName() {
  if (process.arch === "arm64") return "@esbuild/win32-arm64";
  if (process.arch === "ia32") return "@esbuild/win32-ia32";
  return "@esbuild/win32-x64";
}

try {
  const rollupJson = path.join(root, "node_modules", "rollup", "package.json");
  if (fs.existsSync(rollupJson)) {
    const { version } = require(rollupJson);
    installFromPackRoot("@rollup/rollup-win32-x64-msvc", version, {
      isReady: (d) =>
        fs.existsSync(path.join(d, "rollup.win32-x64-msvc.node")),
    });
  }

  const libsqlJson = path.join(root, "node_modules", "libsql", "package.json");
  if (fs.existsSync(libsqlJson)) {
    const lp = require(libsqlJson);
    const winVer =
      lp.optionalDependencies &&
      lp.optionalDependencies["@libsql/win32-x64-msvc"];
    if (winVer) {
      installFromPackRoot("@libsql/win32-x64-msvc", winVer, {
        isReady: (d) => fs.existsSync(path.join(d, "index.node")),
      });
    }
  }

  const esbuildDirs = [];
  collectKnownEsbuildDirs(esbuildDirs);
  const nativeName = esbuildNativePackageName();

  for (const esbuildDir of esbuildDirs) {
    const ep = readJson(path.join(esbuildDir, "package.json"));
    const opt = ep.optionalDependencies || {};
    const esVer = opt[nativeName];
    if (!esVer) continue;
    const parentNm = path.dirname(esbuildDir);
    const dest = destForScopedIn(nativeName, parentNm);
    const esExe = path.join(dest, "esbuild.exe");
    let need = !fs.existsSync(esExe);
    if (!need && fs.existsSync(path.join(dest, "package.json"))) {
      try {
        if (readJson(path.join(dest, "package.json")).version !== esVer) {
          need = true;
        }
      } catch {
        need = true;
      }
    }
    if (need) {
      installFromPackInto(nativeName, esVer, parentNm, {
        force: fs.existsSync(path.join(dest, "package.json")),
        isReady: (d) => fs.existsSync(path.join(d, "esbuild.exe")),
      });
    }
  }
} catch (err) {
  console.log(
    "[forge] Échec installation binaires Windows (ignoré) :",
    err && err.message ? err.message : err
  );
  // process.exit(1);
}
