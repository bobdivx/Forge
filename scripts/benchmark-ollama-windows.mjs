#!/usr/bin/env node
/**
 * Test latence Ollama Windows (qwen) — lancer depuis ton PC ou le NAS :
 *   node scripts/benchmark-ollama-windows.mjs
 *   node scripts/benchmark-ollama-windows.mjs qwen3-coder:30b
 */
const base = process.env.OLLAMA_WIN_URL || 'https://ollama.briseteia.me';
const model = process.argv[2] || 'qwen3-vl:8b';
const body = {
  model,
  messages: [{ role: 'user', content: 'Réponds en une seule courte phrase : 2+2=?' }],
  stream: false,
};

const t0 = performance.now();
const res = await fetch(`${base.replace(/\/$/, '')}/api/chat`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
const t1 = performance.now();
const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  console.error('HTTP', res.status, text.slice(0, 400));
  process.exit(1);
}

const ms = Math.round(t1 - t0);
console.log('URL   ', base);
console.log('Modèle', model);
console.log('HTTP  ', res.status);
console.log('Délai total (réseau + génération, stream=false):', ms, 'ms');
if (json?.message?.content) {
  console.log('Réponse:', json.message.content.trim().slice(0, 200));
}
if (json?.eval_count != null) {
  console.log('eval_count:', json.eval_count, 'eval_duration_ns:', json.eval_duration);
}
