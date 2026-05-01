import type { APIRoute } from 'astro';
import { loadAstroDb } from '../../lib/load-astro-db';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const { model, origin } = body;

  if (!model || !origin) {
    return new Response(JSON.stringify({ error: 'Modèle et origine requis' }), { status: 400 });
  }

  try {
    const testPrompt = `Réponds exactement par le bloc suivant: <FORGE_RULES_AUDIT>{"rules_ok": true}</FORGE_RULES_AUDIT> TEST_PASSED`;
    
    const res = await fetch(`${origin}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: 'user', content: testPrompt }
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!res.ok) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: `Ollama error: ${res.status}` 
      }), { status: 200 });
    }

    const data = await res.json();
    const content = String(data.message?.content || '').trim();
    
    const hasAuditTag = content.includes('<FORGE_RULES_AUDIT>');
    const hasCorrectJson = content.includes('"rules_ok": true') || content.includes('"rules_ok":true');
    const isCompatible = hasAuditTag && hasCorrectJson;

    const { db, Config } = await loadAstroDb();
    const configKey = `compatibility_ollama_${model}`;
    
    // Store result in Config
    const resultValue = JSON.stringify({
      ok: isCompatible,
      testedAt: new Date().toISOString(),
      origin,
      content: content.slice(0, 100)
    });

    await db.insert(Config).values({
      key: configKey,
      value: resultValue,
      updatedAt: new Date()
    }).onConflictDoUpdate({
      target: Config.key,
      set: {
        value: resultValue,
        updatedAt: new Date()
      }
    });

    return new Response(JSON.stringify({ 
      ok: isCompatible, 
      content,
      details: { hasAuditTag, hasCorrectJson }
    }), { status: 200 });

  } catch (e: any) {
    return new Response(JSON.stringify({ 
      ok: false, 
      error: e.message 
    }), { status: 200 });
  }
};

export const GET: APIRoute = async () => {
  try {
    const { db, Config, like } = await loadAstroDb();
    const rows = await db.select().from(Config).where(like(Config.key, 'compatibility_ollama_%'));
    
    const results: Record<string, any> = {};
    for (const row of rows) {
      const modelName = row.key.replace('compatibility_ollama_', '');
      try {
        results[modelName] = JSON.parse(row.value);
      } catch {
        results[modelName] = { ok: false, error: 'Invalid JSON' };
      }
    }

    return new Response(JSON.stringify(results), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
