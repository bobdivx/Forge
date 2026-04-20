import { useEffect, useState } from 'preact/hooks';
import { logForgeOpenClaw } from '../../lib/forge-openclaw-console';

export default function OpenClawLayoutBadge() {
  const [ok, setOk] = useState<boolean | null>(null);
  const [detail, setDetail] = useState('');

  useEffect(() => {
    const load = () => {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 8000);

      fetch('/api/openclaw-health', { signal: ctrl.signal })
        .then((r) => r.json())
        .then((d) => {
          clearTimeout(timeout);
          setOk(Boolean(d.reachable));
          const msg = [d.error, d.hint, d.sessionCount === 0 ? 'Aucune session active détectée' : '']
            .filter(Boolean)
            .join(' — ');
          setDetail(typeof msg === 'string' ? msg : '');
          if (d.openclawDebug && typeof d.openclawDebug === 'object') {
            logForgeOpenClaw('GET /api/openclaw-health', {
              reachable: Boolean(d.reachable),
              gatewayUrl: d.gatewayUrl,
              sessionCount: d.sessionCount,
              runningCount: d.runningCount,
              via: d.via,
              ...d.openclawDebug,
            });
          } else {
            logForgeOpenClaw('GET /api/openclaw-health', {
              reachable: Boolean(d.reachable),
              gatewayUrl: d.gatewayUrl,
              sessionCount: d.sessionCount,
              error: d.error,
            });
          }
        })
        .catch((e) => {
          clearTimeout(timeout);
          setOk(false);
          const isAbort = e && typeof e === 'object' && 'name' in e && String((e as { name?: string }).name) === 'AbortError';
          setDetail(isAbort ? 'Timeout health API (>8s)' : '');
        });
    };
    load();
    const t = setInterval(load, 25000);
    return () => clearInterval(t);
  }, []);

  const badgeBase =
    'badge badge-outline inline-flex max-w-full items-center gap-1.5 border-slate-600/80 py-1.5 px-2 sm:py-2 sm:px-3 text-[10px] sm:text-xs leading-tight';

  if (ok === null) {
    return <span class={`${badgeBase} badge-ghost text-slate-400`}>OpenClaw…</span>;
  }
  if (!ok) {
    return (
      <span
        class={`${badgeBase} badge-warning min-w-0 max-w-[11rem] sm:max-w-[min(100%,20rem)] truncate`}
        title={detail || 'Vérifiez URL + token (Paramètres) et accessibilité depuis le serveur Forge.'}
      >
        <span class="sm:hidden">HS</span>
        <span class="hidden sm:inline">OpenClaw indispo</span>
      </span>
    );
  }
  return (
    <span class={`${badgeBase} badge-success text-emerald-100/95`} title="Gateway OpenClaw joignable">
      <span class="status status-success shrink-0 scale-90 animate-pulse" />
      <span class="truncate whitespace-nowrap">
        <span class="hidden min-[400px]:inline">OpenClaw </span>OK
      </span>
    </span>
  );
}
