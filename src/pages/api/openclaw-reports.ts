import type { APIRoute } from 'astro';
import fs from 'fs';
import path from 'path';
import {
  fetchOpenClawJson,
  normalizeOpenClawSessions,
  mapSessionToAgentRow,
} from '../../lib/openclaw-gateway';

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
 * Rapports : extrait MEMORY.md du workspace OpenClaw si FORGE_OPENCLAW_WORKSPACE est défini,
 * + résumé des sessions (données gateway).
 */
export const GET: APIRoute = async ({ locals }) => {
  const email = locals.user?.email;
  const workspaceRoot = process.env.FORGE_OPENCLAW_WORKSPACE?.trim();

  const reports: { title: string; subtitle: string; body: string; source: string }[] = [];

  if (workspaceRoot) {
    const memoryPath = path.join(workspaceRoot, 'MEMORY.md');
    const mem = readTextSafe(memoryPath, 12000);
    if (mem) {
      reports.push({
        title: 'Mémoire agent (MEMORY.md)',
        subtitle: memoryPath,
        body: mem,
        source: 'filesystem',
      });
    }
    const userPath = path.join(workspaceRoot, 'USER.md');
    const userMd = readTextSafe(userPath, 4000);
    if (userMd) {
      reports.push({
        title: 'Contexte utilisateur (USER.md)',
        subtitle: userPath,
        body: userMd,
        source: 'filesystem',
      });
    }
  }

  const gw = await fetchOpenClawJson(email, '/health');
  let sessionSummary = '';
  if (gw.ok) {
    const sessions = normalizeOpenClawSessions(gw.data);
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
        title: 'État des sessions (OpenClaw)',
        subtitle: 'Données live via gateway',
        body: sessionSummary,
        source: 'gateway',
      });
    }
  } else if (reports.length === 0) {
    reports.push({
      title: 'Aucun rapport local',
      subtitle: 'Configuration',
      body:
        'Définissez `FORGE_OPENCLAW_WORKSPACE` (chemin du workspace OpenClaw, ex. dossier contenant MEMORY.md) pour afficher la mémoire ici. Les sessions s’affichent quand le jeton OpenClaw est valide dans les Paramètres.',
      source: 'hint',
    });
  }

  return new Response(JSON.stringify({ reports }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
