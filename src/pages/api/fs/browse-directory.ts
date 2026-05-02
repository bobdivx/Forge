import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export const prerender = false;

type Entry = { name: string; path: string };

async function listWindowsDrives(): Promise<Entry[]> {
  const out: Entry[] = [];
  for (let i = 65; i <= 90; i++) {
    const letter = String.fromCharCode(i);
    const p = `${letter}:\\`;
    try {
      await fs.access(p);
      out.push({ name: `${letter}:`, path: p });
    } catch {
      /* absent */
    }
  }
  return out;
}

/**
 * Liste les dossiers d’un chemin absolu (machine où tourne Forge).
 * Auth requise — même périmètre que les paramètres chemins.
 */
export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  }

  const u = new URL(url);
  const rawPath = u.searchParams.get('path')?.trim();
  if (rawPath === '__roots__') {
    if (process.platform !== 'win32') {
      return new Response(JSON.stringify({ error: 'Sélecteur de lecteurs disponible sur Windows uniquement.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const entries = await listWindowsDrives();
    return new Response(JSON.stringify({ current: '', parent: null, entries, roots: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rootsOnly = u.searchParams.get('roots') === '1';
  if (rootsOnly && process.platform === 'win32') {
    const entries = await listWindowsDrives();
    return new Response(JSON.stringify({ current: '', parent: null, entries, roots: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const raw = u.searchParams.get('path');
  let resolved: string;
  try {
    resolved = raw?.trim() ? path.resolve(raw.trim()) : os.homedir();
  } catch {
    return new Response(JSON.stringify({ error: 'Chemin invalide' }), { status: 400 });
  }

  try {
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
      return new Response(
        JSON.stringify({
          error: 'Ce chemin n’est pas un dossier',
          current: resolved,
          parent: path.dirname(resolved),
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const dirents = await fs.readdir(resolved, { withFileTypes: true });
    const entries: Entry[] = dirents
      .filter((d) => d.isDirectory() && !d.name.startsWith('$'))
      .map((d) => ({
        name: d.name,
        path: path.join(resolved, d.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));

    let parent: string | null = path.dirname(resolved);
    if (parent === resolved) {
      parent = null;
    }
    if (process.platform === 'win32' && /^[A-Za-z]:\\$/.test(resolved)) {
      parent = '__roots__';
    }

    return new Response(JSON.stringify({ current: resolved, parent, entries, roots: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Lecture impossible';
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
