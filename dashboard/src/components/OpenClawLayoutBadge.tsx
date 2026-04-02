import { useEffect, useState } from 'preact/hooks';

/** Badge compact pour le layout (navbar). */
export default function OpenClawLayoutBadge() {
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    const load = () => {
      fetch('/api/openclaw-health')
        .then((r) => r.json())
        .then((d) => setOk(Boolean(d.reachable)))
        .catch(() => setOk(false));
    };
    load();
    const t = setInterval(load, 25000);
    return () => clearInterval(t);
  }, []);

  if (ok === null) {
    return (
      <span class="badge badge-ghost badge-outline gap-2 py-3 px-3 text-xs border-slate-700 text-slate-400">
        OpenClaw…
      </span>
    );
  }

  if (!ok) {
    return (
      <span class="badge badge-warning badge-outline gap-2 py-3 px-3 text-xs">
        OpenClaw indisponible
      </span>
    );
  }

  return (
    <span class="badge badge-success badge-outline gap-2 py-3 px-3 text-xs">
      <span class="status status-success animate-pulse"></span>
      OpenClaw connecté
    </span>
  );
}
