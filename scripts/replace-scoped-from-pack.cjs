"use strict";

/**
 * Remplace un paquet @scope/name dans node_modules via npm pack dans %TEMP%
 * (évite le nettoyage agressif de npm sur lecteur réseau → EPERM).
 *
 * Usage : node scripts/replace-scoped-from-pack.cjs @astrojs/node 10.0.4
 */
const { execSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const root = path.join(__dirname, "..");

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function destForScoped(scopedName) {
  const m = scopedName.match(/^(@[^/]+)\/(.+)$/);
  if (!m) throw new Error(`Nom attendu @scope/pkg, reçu : ${scopedName}`);
  return path.join(root, "node_modules", m[1], m[2]);
}

const scopedName = process.argv[2];
const version = process.argv[3];
if (!scopedName || !version) {
  console.error("Usage: node scripts/replace-scoped-from-pack.cjs @astrojs/node 10.0.4");
  process.exit(1);
}

const dest = destForScoped(scopedName);
console.log(`[forge] ${scopedName}@${version} → ${path.relative(root, dest)} (npm pack, hors NAS)`);

/** Windows / NAS : retire la lecture seule sur l’ancien paquet pour faciliter rm/rename. */
function clearReadOnlyWin(dir) {
  if (process.platform !== "win32" || !fs.existsSync(dir)) return;
  try {
    execSync(`cmd /c attrib -R "${dir}\\*.*" /S /D >nul 2>&1`, {
      stdio: "ignore",
      shell: true,
    });
  } catch {
    /* ignore */
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "forge-pack-"));
try {
  execSync(`npm pack "${scopedName}@${version}"`, {
    cwd: tmp,
    stdio: "inherit",
    shell: true,
  });
  const tgz = fs.readdirSync(tmp).find((f) => f.endsWith(".tgz"));
  if (!tgz) throw new Error("npm pack: aucun .tgz");
  execSync(`tar -xzf "${path.join(tmp, tgz)}"`, { cwd: tmp, stdio: "inherit", shell: true });
  const extracted = path.join(tmp, "package");
  if (!fs.existsSync(extracted)) throw new Error("dossier package/ absent après tar");

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  clearReadOnlyWin(dest);
  try {
    fs.rmSync(dest, { recursive: true, force: true });
  } catch (e) {
    const bak = `${dest}.forge-bak-${Date.now()}`;
    console.warn(`[forge] rmSync impossible (${e.code || e.message}), renommage → ${path.basename(bak)}`);
    try {
      fs.renameSync(dest, bak);
    } catch (e2) {
      console.error("[forge] Fermez le dev server / l’IDE qui verrouille node_modules, puis réessayez.");
      throw e2;
    }
  }
  fs.cpSync(extracted, dest, { recursive: true });

  const installed = readJson(path.join(dest, "package.json")).version;
  console.log(`[forge] OK : ${scopedName}@${installed}`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
