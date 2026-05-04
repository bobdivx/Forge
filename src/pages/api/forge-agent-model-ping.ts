import type { APIRoute } from 'astro';
import { getOllamaOriginResolved } from '../../lib/config-db';

type OllamaChatResponse = {
  message?: { content?: string };
  response?: string;
};

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const model = String(body?.model || '').trim();
  const prompt = String(body?.userMessage || 'Réponds uniquement par le mot PONG.').trim();

  if (!model) {
    return new Response(JSON.stringify({ ok: false, latencyMs: 0, error: 'Modèle LLM requis' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const origin = await getOllamaOriginResolved();
  if (!origin) {
    return new Response(JSON.stringify({ ok: false, latencyMs: 0, error: 'URL Ollama non configurée' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const started = Date.now();
  try {
    const res = await fetch(`${origin.replace(/\/+$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        options: { num_predict: 24 },
      }),
    });
    const latencyMs = Date.now() - started;
    const data = (await res.json().catch(() => ({}))) as OllamaChatResponse & { error?: string };
    return new Response(
      JSON.stringify({
        ok: res.ok,
        latencyMs,
        status: res.status,
        preview: data.message?.content || data.response || '',
        error: res.ok ? undefined : data.error || `Ollama HTTP ${res.status}`,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({
        ok: false,
        latencyMs: Date.now() - started,
        status: 0,
        error: e instanceof Error ? e.message : String(e),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
