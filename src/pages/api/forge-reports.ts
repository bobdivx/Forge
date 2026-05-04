import type { APIRoute } from 'astro';
import fs from 'fs';
import path from 'path';
import {
  fetchZimaOSJson,
  normalizeZimaOSSessions,
  mapSessionToAgentRow,
} from '../../lib/forge-gateway';

function readTextSafe(filePath: string, maxChars: number): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const buf = fs.readFileSync(filePath, 'utf-8');
    if (buf.length <= maxChars) return buf;
    return buf.slice(0, maxChars) + '\n\n… (tronqué)';
  } catch {
    return null;
  }
}

/**
 * Rapports : extrait MEMORY.md du workspace ZimaOS si FORGE_ZIMAOS_WORKSPACE est défini,
 * + résumé des sessions (données gateway).
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const email = locals.user?.email;
  const lang = String(url.searchParams.get('lang') || '').toLowerCase() === 'en' ? 'en' : 'fr';
  const workspaceRoot = process.env.FORGE_ZIMAOS_WORKSPACE?.trim();

  const reports: { title: string; subtitle: string; body: string; source: string }[] = [];

  if (workspaceRoot) {
    const memoryPath = path.join(workspaceRoot, 'MEMORY.md');
    const mem = readTextSafe(memoryPath, 12000);
    if (mem) {
      reports.push({
        title: lang === 'en' ? 'Agent memory (MEMORY.md)' : 'Mémoire agent (MEMORY.md)',
        subtitle: memoryPath,
        body: mem,
        source: 'filesystem',
      });
    }
    const userPath = path.join(workspaceRoot, 'USER.md');
    const userMd = readTextSafe(userPath, 4000);
    if (userMd) {
      reports.push({
        title: lang === 'en' ? 'User context (USER.md)' : 'Contexte utilisateur (USER.md)',
        subtitle: userPath,
        body: userMd,
        source: 'filesystem',
      });
    }
  }

  const gw = await fetchZimaOSJson(email, '/health');
  let sessionSummary = '';
  if (gw.ok) {
    const sessions = normalizeZimaOSSessions(gw.data) as Record<string, unknown>[];
    const rows = sessions.map(mapSessionToAgentRow);
    rows.sort((a, b) => b.lastSeenMs - a.lastSeenMs);
    sessionSummary = rows
      .slice(0, 25)
      .map(
        (r) =>
          `- **${r.name}** · ${r.status} · ${r.model} · ${r.lastSeen}`
      )
      .join('\n');
    if (sessionSummary) {
      reports.unshift({
        title: lang === 'en' ? 'Session status (ZimaOS)' : 'État des sessions (ZimaOS)',
        subtitle: lang === 'en' ? 'Live data via gateway' : 'Données live via gateway',
        body: sessionSummary,
        source: 'gateway',
      });
    }
  } else if (reports.length === 0) {
    reports.push({
      title: lang === 'en' ? 'No local report' : 'Aucun rapport local',
      subtitle: lang === 'en' ? 'Configuration' : 'Configuration',
      body:
        lang === 'en'
          ? 'Set `FORGE_ZIMAOS_WORKSPACE` (path to your ZimaOS workspace, e.g. the folder containing MEMORY.md) to display memory here. Sessions appear when the ZimaOS token is valid in Settings.'
          : 'Définissez `FORGE_ZIMAOS_WORKSPACE` (chemin du workspace ZimaOS, ex. dossier contenant MEMORY.md) pour afficher la mémoire ici. Les sessions s’affichent quand le jeton ZimaOS est valide dans les Paramètres.',
      source: 'hint',
    });
  }

  return new Response(JSON.stringify({ reports }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
