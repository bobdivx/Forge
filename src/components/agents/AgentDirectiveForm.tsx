import { useState } from 'preact/hooks';

export default function AgentDirectiveForm({ sessionKey }: { sessionKey: string }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const send = async () => {
    const message = text.trim();
    if (!message) {
      setMsg({ type: 'err', text: 'Saisissez une directive.' });
      return;
    }
    if (!sessionKey) {
      setMsg({ type: 'err', text: 'Session inconnue.' });
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/zimaos-directive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionKey, message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg({ type: 'err', text: typeof data.error === 'string' ? data.error : 'Envoi refusé par le gateway' });
        return;
      }
      const result = data.result as Record<string, unknown> | undefined;
      const status = result && typeof result.status === 'string' ? result.status : '';
      const reply = result && typeof result.reply === 'string' ? result.reply : '';
      if (reply) {
        setMsg({
          type: 'ok',
          text: `Réponse (${status || 'ok'}) : ${reply.slice(0, 500)}${reply.length > 500 ? '…' : ''}`,
        });
      } else {
        setMsg({
          type: 'ok',
          text:
            status === 'accepted'
              ? 'Directive acceptée (traitement asynchrone).'
              : `Directive envoyée${status ? ` — ${status}` : ''}.`,
        });
      }
      setText('');
    } catch {
      setMsg({ type: 'err', text: 'Erreur réseau' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="rounded-[1.5rem] border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <svg class="w-4 h-4 shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        </svg>
        <h3 class="font-semibold text-gray-900 text-sm">Contrôle session</h3>
      </div>
      <div class="px-6 py-5 space-y-4">
        <p class="text-[11px] text-gray-500 leading-relaxed">
          Envoie un message dans la session ZimaOS{' '}
          <span class="font-mono text-[10px] text-gray-600 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100 break-all">
            {sessionKey}
          </span>
        </p>
        <textarea
          class="w-full min-h-[120px] border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none resize-y"
          placeholder="Ex. : Vérifie les logs du service X et résume les erreurs…"
          value={text}
          onInput={(e) => setText((e.target as HTMLTextAreaElement).value)}
          disabled={loading}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={loading || !text.trim()}
          class="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#175B37] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-45 disabled:cursor-not-allowed transition-opacity"
        >
          {loading ? (
            <span>Envoi…</span>
          ) : (
            <>
              <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
              Envoyer directive
            </>
          )}
        </button>
        {msg ? (
          <div
            class={
              'text-xs p-3 rounded-lg border ' +
              (msg.type === 'ok'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800')
            }
          >
            {msg.text}
          </div>
        ) : null}
      </div>
    </div>
  );
}
