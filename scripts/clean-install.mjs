/**
 * Supprime node_modules puis relance npm install.
 * Sur SMB, supprimer d’abord le contenu (robocopy /MIR depuis un dossier vide) évite
 * « Le répertoire n’est pas vide » sur des noms 8.3 (ex. N5VTH0~R).
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const nm = path.join(root, "node_modules");

process.chdir(root);

function quoteWin(p) {
  return `"${p.replace(/"/g, '\\"')}"`;
}

function run(cmd) {
  execSync(cmd, { stdio: "inherit", cwd: root, shell: true });
}

/** Préfixe Win32 pour chemins longs / SMB (évite souvent ENOTEMPTY). */
function toWin32ExtendedPath(p) {
  const norm = path.resolve(p);
  if (norm.startsWith("\\\\")) {
    return "\\\\?\\UNC\\" + norm.replace(/^\\\\/, "").replace(/\//g, "\\");
  }
  return "\\\\?\\" + norm.replace(/\//g, "\\");
}

/**
 * Robocopy : codes 0–7 = succès partiel ou OK ; >= 8 = erreur grave.
 */
function robocopyMirrorEmpty(emptyDir, targetDir) {
  const extEmpty = toWin32ExtendedPath(emptyDir);
  const extTarget = toWin32ExtendedPath(targetDir);
  try {
    execSync(
      `robocopy ${quoteWin(extEmpty)} ${quoteWin(extTarget)} /MIR /R:5 /W:2 /MT:8 /NFL /NDL /NJH /NJS /NP`,
      { stdio: "inherit", cwd: root, shell: true }
    );
  } catch (e) {
    const s = e?.status;
    if (typeof s === "number" && s >= 0 && s < 8) return;
    throw e;
  }
}

function clearAttributesWin32(nmPath) {
  const ext = toWin32ExtendedPath(nmPath);
  try {
    run(`cmd /c attrib -r -s -h ${quoteWin(ext + "\\*.*")} /s /d`);
  } catch {
    /* ignore */
  }
}

function removeNodeModulesRobust(nmPath) {
  if (!fs.existsSync(nmPath)) return;

  console.log("[forge] Suppression de node_modules…");

  if (process.platform === "win32") {
    clearAttributesWin32(nmPath);

    const empty = path.join(root, `.forge-empty-${process.pid}-${Date.now()}`);
    fs.mkdirSync(empty, { recursive: true });
    try {
      for (let pass = 0; pass < 3; pass++) {
        if (!fs.existsSync(nmPath)) break;
        console.log(`[forge] Vidage node_modules (robocopy /MIR, passe ${pass + 1}/3)…`);
        robocopyMirrorEmpty(empty, nmPath);
      }
      fs.rmSync(empty, { recursive: true, force: true });
    } catch (e) {
      try {
        fs.rmSync(empty, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
      console.log(`[forge] Robocopy : ${e.message ?? e}`);
    }

    const extNm = toWin32ExtendedPath(nmPath);
    try {
      run(`cmd /c rmdir /s /q ${quoteWin(extNm)}`);
    } catch {
      /* ignore */
    }

    if (fs.existsSync(nmPath)) {
      const lit = extNm.replace(/'/g, "''");
      try {
        run(
          `powershell -NoProfile -Command "Remove-Item -LiteralPath '${lit}' -Recurse -Force -ErrorAction SilentlyContinue"`
        );
      } catch {
        /* ignore */
      }
    }
  }

  if (fs.existsSync(nmPath)) {
    try {
      fs.rmSync(nmPath, { recursive: true, force: true, maxRetries: 30, retryDelay: 500 });
    } catch (e) {
      console.log(`[forge] rmSync : ${e.code ?? e.message}`);
    }
  }

  if (process.platform === "win32" && fs.existsSync(nmPath)) {
    try {
      run(`cmd /c rmdir /s /q ${quoteWin(nmPath)}`);
    } catch {
      /* ignore */
    }
  }

  if (fs.existsSync(nmPath)) {
    throw new Error(
      "node_modules est toujours là. Ferme Cursor et tout terminal sur ce dossier, tue les processus node.exe, puis relance « npm run reinstall ». Sinon supprime Y:\\node_modules dans l’Explorateur, ou copie le projet sur C:\\."
    );
  }
}

removeNodeModulesRobust(nm);

console.log("[forge] npm install…");
execSync("npm install --install-strategy=nested --no-fund --no-audit", {
  stdio: "inherit",
  env: process.env,
  cwd: root,
  shell: true,
});
