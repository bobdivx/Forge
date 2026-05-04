import { useEffect, useMemo, useRef } from 'preact/hooks';

/** Histogramme 24h des événements swarm (timeline API). */
export default function SwarmCommunicationHeatmap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const buckets = useMemo(() => new Array(24).fill(0), []);

  useEffect(() => {
    let alive = true;
    fetch('/api/swarm-interactions')
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const tl = Array.isArray(d.timeline) ? d.timeline : [];
        const counts = new Array(24).fill(0);
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        for (const ev of tl) {
          const t = Number(ev.at || 0);
          if (!Number.isFinite(t) || t < cutoff) continue;
          const h = new Date(t).getHours();
          counts[h] += 1;
        }
        const ctx = canvasRef.current?.getContext('2d');
        const c = canvasRef.current;
        if (!ctx || !c) return;
        const w = c.parentElement?.clientWidth || 640;
        const h = 180;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        c.width = Math.floor(w * dpr);
        c.height = Math.floor(h * dpr);
        c.style.width = `${w}px`;
        c.style.height = `${h}px`;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(0, 0, w, h);
        const max = Math.max(1, ...counts);
        const barW = (w - 40) / 24;
        for (let i = 0; i < 24; i++) {
          const bh = (counts[i] / max) * (h - 40);
          ctx.fillStyle = '#175B37';
          ctx.fillRect(20 + i * barW, h - 20 - bh, Math.max(2, barW - 2), bh);
          ctx.fillStyle = '#9ca3af';
          ctx.font = '8px system-ui';
          if (i % 3 === 0) ctx.fillText(String(i), 20 + i * barW, h - 4);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [buckets]);

  useEffect(() => {
    const id = window.setInterval(() => {
      window.dispatchEvent(new Event('forge-swarm-refresh'));
    }, 18_000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div class="w-full">
      <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Volume swarm · 24 h</p>
      <canvas ref={canvasRef} class="w-full rounded-xl border border-gray-100 bg-gray-50" />
    </div>
  );
}
