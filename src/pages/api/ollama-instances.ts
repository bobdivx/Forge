import type { APIRoute } from 'astro';
import { loadAstroDb } from '../../lib/load-astro-db';
import { eq, desc } from 'drizzle-orm';

export const GET: APIRoute = async () => {
  try {
    const { db, OllamaInstance } = await loadAstroDb();
    if (!OllamaInstance) throw new Error('Table OllamaInstance non trouvée');
    
    const instances = await db.select().from(OllamaInstance).orderBy(desc(OllamaInstance.createdAt));
    return new Response(JSON.stringify(instances), {
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
