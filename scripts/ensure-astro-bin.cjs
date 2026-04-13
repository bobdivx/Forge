"use strict";

/**
 * Recrée node_modules/.bin/astro* si npm a laissé un état cassé (ENOENT sur Y: / NAS).
 * Sur SMB, l’écriture peut échouer (EPERM) : on tente attrib/del puis on ignore sans bloquer fix:adapter.
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const astroMjs = path.join(root, "node_modules", "astro", "bin", "astro.mjs");
const binDir = path.join(root, "node_modules", ".bin");
const cmdPath = path.join(binDir, "astro.cmd");
const shPath = path.join(binDir, "astro");

if (!fs.existsSync(astroMjs)) {
  process.exit(0);
}

function needsRepair() {
  if (!fs.existsSync(binDir)) return true;
  if (!fs.existsSync(cmdPath)) return true;
  try {
    if (!fs.existsSync(shPath)) return true;
  } catch {
    return true;
  }
  return false;
}

/** Windows : retire lecture seule + supprime le fichier (verrou SMB). */
function unlockFileWin(p) {
  if (process.platform !== "win32") return;
  try {
    execSync(`cmd /c attrib -R "${p}" >nul 2>&1`, { stdio: "ignore", shell: true });
  } catch {
    /* ignore */
  }
  try {
    if (fs.existsSync(p)) {
      execSync(`cmd /c del /F /Q "${p}" >nul 2>&1`, { stdio: "ignore", shell: true });
    }
  } catch {
    /* ignore */
  }
}

function writeFileSafe(abs, content, label) {
  try {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, "utf8");
    return true;
  } catch (e) {
    if (e.code === "EPERM" && process.platform === "win32") {
      unlockFileWin(abs);
      try {
        fs.writeFileSync(abs, content, "utf8");
        return true;
      } catch (e2) {
        console.warn(`[forge] ${label} : écriture impossible après déverrouillage (${e2.code || e2.message}).`);
        return false;
      }
    }
    console.warn(`[forge] ${label} : ${e.code || e.message}`);
    return false;
  }
}

if (!needsRepair()) {
  process.exit(0);
}

fs.mkdirSync(binDir, { recursive: true });

const cmd =
  "@ECHO off\r\n" +
  "SETLOCAL\r\n" +
  'node "%~dp0..\\astro\\bin\\astro.mjs" %*\r\n';

const launcher =
  "#!/usr/bin/env node\n" +
  '"use strict";\n' +
  "const { spawnSync } = require('child_process');\n" +
  "const path = require('path');\n" +
  "const target = path.join(__dirname, '..', 'astro', 'bin', 'astro.mjs');\n" +
  "const r = spawnSync(process.execPath, [target, ...process.argv.slice(2)], { stdio: 'inherit' });\n" +
  "process.exit(r.status == null ? 1 : r.status);\n";

const okCmd = writeFileSafe(cmdPath, cmd, ".bin/astro.cmd");
const okSh = writeFileSafe(shPath, launcher, ".bin/astro");

if (okSh) {
  try {
    fs.chmodSync(shPath, 0o755);
  } catch {
    /* Windows / NAS */
  }
}

if (okCmd && okSh) {
  console.log("[forge] Shim .bin/astro recréé (astro.cmd + astro)");
} else {
  console.warn(
    "[forge] Shims .bin ignorés (NAS / verrou). `npm run dev` utilise scripts/run-astro.mjs — pas besoin de .bin pour développer."
  );
}

process.exit(0);
