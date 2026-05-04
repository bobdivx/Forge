import type { APIRoute } from 'astro';
import { loadAstroDb } from '../../lib/load-astro-db';
import { eq, desc } from 'drizzle-orm';

type OllamaHealthProbe = {
  ok: boolean;
  status: number;
  endpoint: string;
  error?: string;
  models?: string[];
};

type OllamaInstanceRow = {
  id: number;
  name: string;
  url: string;
  apiKey?: string;
  enabled: number | null;
  updatedAt: Date;
  createdAt: Date;
};

function normalizeBase(url: string): string {
  const raw = String(url || '').trim();
  if (!raw) return '';
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
  try {
    const parsed = new URL(withProtocol.replace(/\/v1$/i, '').replace(/\/api$/i, ''));
    if (parsed.hostname === '0.0.0.0') parsed.hostname = '127.0.0.1';
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return withProtocol.replace(/\/$/, '').replace(/\/v1$/i, '').replace(/\/api$/i, '');
  }
}

async function probeOllamaBase(base: string): Promise<OllamaHealthProbe> {
  const candidates = ['/api/tags', '/v1/models'];
  for (const endpoint of candidates) {
    const target = `${base}${endpoint}`;
    try {
      const res = await fetch(target, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(2200),
      });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const modelsArr = Array.isArray(data.models) ? data.models : Array.isArray(data.data) ? data.data : [];
        const models = modelsArr.map((m: any) => String(m.name || m.model || m.id || '').trim()).filter(Boolean);
        return { ok: true, status: res.status, endpoint, models };
      }
      if (res.status !== 404) {
        return { ok: false, status: res.status, endpoint, error: `HTTP ${res.status}` };
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erreur réseau';
      return { ok: false, status: 0, endpoint, error: msg };
    }
  }
  return { ok: false, status: 404, endpoint: '/api/tags', error: 'Endpoints Ollama non trouvés (/api/tags, /v1/models).' };
}

export const GET: APIRoute = async () => {
  try {
    const { db, OllamaInstance } = await loadAstroDb();
    if (!OllamaInstance) throw new Error('Table OllamaInstance non trouvée');

    const instances = (await db.select().from(OllamaInstance).orderBy(desc(OllamaInstance.createdAt))) as OllamaInstanceRow[];
    const withHealth = await Promise.all(
      instances.map(async (inst) => {
        const base = normalizeBase(inst.url);
        const health = Number(inst.enabled) === 0 ? null : await probeOllamaBase(base);
        return {
          ...inst,
          normalizedUrl: base,
          health,
        };
      }),
    );
    return new Response(JSON.stringify(withHealth), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    console.error('GET /api/ollama-instances error:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const { db, OllamaInstance } = await loadAstroDb();
    if (!OllamaInstance) throw new Error('Table OllamaInstance non trouvée');

    const body = await request.json();
    const { name, url, enabled, apiKey } = body;
    
    if (!name || !url) {
      return new Response(JSON.stringify({ error: 'Nom et URL requis' }), { status: 400 });
    }

    const res = await db.insert(OllamaInstance).values({
      name,
      url: url.replace(/\/$/, ''),
      apiKey: apiKey || '',
      enabled: enabled ?? 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning();

    return new Response(JSON.stringify(res[0]), { status: 201 });
  } catch (e: any) {
    console.error('POST /api/ollama-instances error:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

export const PUT: APIRoute = async ({ request }) => {
  try {
    const { db, OllamaInstance } = await loadAstroDb();
    if (!OllamaInstance) throw new Error('Table OllamaInstance non trouvée');

    const body = await request.json();
    const { id, name, url, enabled, apiKey } = body;
    
    if (!id) return new Response(JSON.stringify({ error: 'ID requis' }), { status: 400 });

    await db.update(OllamaInstance)
      .set({
        name,
        url: url ? url.replace(/\/$/, '') : undefined,
        enabled: typeof enabled === 'number' ? enabled : undefined,
        apiKey,
        updatedAt: new Date(),
      })
      .where(eq(OllamaInstance.id, id));

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e: any) {
    console.error('PUT /api/ollama-instances error:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

export const DELETE: APIRoute = async ({ request }) => {
  try {
    const { db, OllamaInstance } = await loadAstroDb();
    if (!OllamaInstance) throw new Error('Table OllamaInstance non trouvée');

    const url = new URL(request.url);
    const id = parseInt(url.searchParams.get('id') || '');
    
    if (isNaN(id)) return new Response(JSON.stringify({ error: 'ID invalide' }), { status: 400 });

    await db.delete(OllamaInstance).where(eq(OllamaInstance.id, id));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e: any) {
    console.error('DELETE /api/ollama-instances error:', e);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
