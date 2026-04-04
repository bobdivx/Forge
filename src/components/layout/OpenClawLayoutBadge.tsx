import { useEffect, useState } from 'preact/hooks';
import { logForgeOpenClaw } from '../../lib/forge-openclaw-console';

export default function OpenClawLayoutBadge() {
  const [ok, setOk] = useState<boolean | null>(null);
  const [detail, setDetail] = useState('');

  useEffect(() => {
    const load = () => {
      fetch('/api/openclaw-health')
        .then((r) => r.json())
        .then((d) => {
          setOk(Boolean(d.reachable));
          const msg = [d.error, d.hint].filter(Boolean).join(' — ');
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
        .catch(() => {
          setOk(false);
          setDetail('');
        });
    };
    load();
    const t = setInterval(load, 25000);
    return () => clearInterval(t);
  }, []);

  if (ok === null) return <span class="badge badge-ghost badge-outline gap-2 py-3 px-3 text-xs border-slate-700 text-slate-400">OpenClaw…</span>;
  if (!ok) {
    return (
      <span
        class="badge badge-warning badge-outline gap-2 py-3 px-3 text-xs max-w-[min(100%,20rem)] truncate"
        title={detail || 'Vérifiez URL + token (Paramètres) et accessibilité depuis le serveur Forge.'}
      >
        OpenClaw indisponible
      </span>
    );
  }
  return <span class="badge badge-success badge-outline gap-2 py-3 px-3 text-xs"><span class="status status-success animate-pulse" />OpenClaw connecté</span>;
}
