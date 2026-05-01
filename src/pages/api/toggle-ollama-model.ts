import type { APIRoute } from 'astro';
import { loadAstroDb } from '../../lib/load-astro-db';

export const POST: APIRoute = async ({ request }) => {

  const body = await request.json().catch(() => ({}));
  const { model, disabled } = body;

  if (model === undefined) {
    return new Response(JSON.stringify({ error: 'Modèle requis' }), { status: 400 });
  }

  try {
    const { db, Config } = await loadAstroDb();
    const configKey = `compatibility_ollama_${model}`;
    
    // Get existing
    const existing = await db.select().from(Config).where(eq(Config.key, configKey));
    let val: any = {};
    if (existing.length) {
      try {
        val = JSON.parse(existing[0].value);
      } catch {}
    }

    val.disabledManually = !!disabled;
    val.updatedAt = new Date().toISOString();

    const resultValue = JSON.stringify(val);

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

    return new Response(JSON.stringify({ ok: true, disabled: !!disabled }), { status: 200 });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

import { eq } from 'drizzle-orm';
