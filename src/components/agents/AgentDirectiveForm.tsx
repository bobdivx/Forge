import { useState } from 'preact/hooks';

export default function AgentDirectiveForm({ sessionKey }: { sessionKey: string }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const send = async () => {
    const message = text.trim();
    if (!message) { setMsg({ type: 'err', text: 'Saisissez une directive.' }); return; }
    if (!sessionKey) { setMsg({ type: 'err', text: 'Session inconnue.' }); return; }
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/openclaw-directive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionKey, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setMsg({ type: 'err', text: typeof data.error === 'string' ? data.error : 'Envoi refusé par le gateway' }); return; }
      const result = data.result as Record<string, unknown> | undefined;
      const status = result && typeof result.status === 'string' ? result.status : '';
      const reply = result && typeof result.reply === 'string' ? result.reply : '';
      if (reply) {
        setMsg({ type: 'ok', text: `Réponse (${status || 'ok'}) : ${reply.slice(0, 500)}${reply.length > 500 ? '…' : ''}` });
      } else {
        setMsg({ type: 'ok', text: status === 'accepted' ? 'Directive acceptée (traitement asynchrone).' : `Directive envoyée${status ? ` — ${status}` : ''}.` });
      }
      setText('');
    } catch {
      setMsg({ type: 'err', text: 'Erreur réseau' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
      <h3 class="font-bold text-white text-sm uppercase tracking-widest text-slate-500">Contrôle session</h3>
      <p class="text-[11px] text-slate-500">
        Envoie un message dans la session OpenClaw (<span class="font-mono text-slate-600">{sessionKey}</span>).
      </p>
      <textarea
        class="textarea textarea-bordered w-full min-h-[120px] bg-slate-950 border-slate-700 text-sm text-white placeholder:text-slate-600 focus:border-blue-500"
        placeholder="Ex. : Vérifie les logs du service X et résume les erreurs…"
        value={text}
        onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
        disabled={loading}
      />
      <button type="button" onClick={() => void send()} disabled={loading || !text.trim()} class={`btn btn-primary btn-sm w-full gap-2 shadow-lg shadow-blue-500/20 ${loading ? 'loading' : ''}`}>
        {!loading && <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>}
        Envoyer directive
      </button>
      {msg && (
        <div class={`text-xs p-3 rounded-lg border ${msg.type === 'ok' ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200' : 'bg-red-500/10 border-red-500/25 text-red-200'}`}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
