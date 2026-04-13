import type { APIRoute } from 'astro';
import fs from 'fs';
import { resolveProjectPathVariants, isSafeRepoDirName } from '../../../../lib/forge-repos';
import { devPidsDir } from '../../../../lib/project-app-config';

const SERVER_ID_RE = /^[a-zA-Z0-9_-]{1,48}$/;
const MAX_LINES = 500;

/** Retourne les N dernières lignes d'un fichier texte sans charger tout le fichier en mémoire. */
function tailLines(filePath: string, n: number): string[] {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return [];
    // Lecture des derniers 128 KB max (suffisant pour 500 lignes en pratique)
    const maxBytes = Math.min(stat.size, 128 * 1024);
    const buf = Buffer.alloc(maxBytes);
    const fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, maxBytes, stat.size - maxBytes);
    fs.closeSync(fd);
    const text = buf.toString('utf-8');
    const lines = text.split('\n');
    // Retire la première ligne incomplète si on n'est pas au début du fichier
    const start = stat.size > maxBytes ? 1 : 0;
    return lines.slice(start).slice(-n);
  } catch {
    return [];
  }
}

export const GET: APIRoute = async ({ params, url }) => {
  const app = params.app;
  if (!isSafeRepoDirName(String(app))) {
    return new Response(JSON.stringify({ error: 'Nom invalide' }), { status: 400 });
  }

  const serverId = url.searchParams.get('serverId') ?? '';
  if (!SERVER_ID_RE.test(serverId)) {
    return new Response(JSON.stringify({ error: 'serverId invalide' }), { status: 400 });
  }

  const lines = Math.min(
    parseInt(url.searchParams.get('lines') ?? '200', 10) || 200,
    MAX_LINES
  );

  const projectPath = await resolveProjectPathVariants(String(app));
  if (!projectPath) {
    return new Response(JSON.stringify({ error: 'Projet introuvable' }), { status: 404 });
  }

  const logPath = `${devPidsDir(projectPath)}/${serverId}.log`;

  if (!fs.existsSync(logPath)) {
    return new Response(JSON.stringify({ lines: [], exists: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const tail = tailLines(logPath, lines);

  return new Response(
    JSON.stringify({ lines: tail, exists: true, path: `${app}/.forge/dev-pids/${serverId}.log` }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
