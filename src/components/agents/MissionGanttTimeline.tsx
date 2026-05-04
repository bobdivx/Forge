import { useEffect, useRef, useState } from 'preact/hooks';

type Task = {
  id: number;
  agentId: string;
  task: string;
  status: string;
  createdAt: string;
  updatedAt: string;
};

export default function MissionGanttTimeline() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    let alive = true;
    function load() {
      fetch('/api/agent-tasks?limit=400')
        .then((r) => r.json())
        .then((d) => {
          if (!alive) return;
          setTasks(Array.isArray(d.tasks) ? d.tasks : []);
        })
        .catch(() => {});
    }
    load();
    const id = window.setInterval(load, 12_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const canvasEl: HTMLCanvasElement = canvas;
    const wrapEl: HTMLDivElement = wrap;
    const ctxRaw = canvasEl.getContext('2d');
    if (!ctxRaw) return;
    const ctx: CanvasRenderingContext2D = ctxRaw;

    function paint() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = wrapEl.clientWidth;
      const rowH = 22;
      const agents = [...new Set(tasks.map((t) => t.agentId))].sort();
      const h = Math.max(200, 40 + agents.length * rowH);
      canvasEl.width = Math.floor(w * dpr);
      canvasEl.height = Math.floor(h * dpr);
      canvasEl.style.width = `${w}px`;
      canvasEl.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);

      const now = Date.now();
      const start = now - 24 * 60 * 60 * 1000;
      const gx0 = 160;
      const gx1 = w - 16;
      const gw = gx1 - gx0;

      ctx.strokeStyle = '#e5e7eb';
      ctx.beginPath();
      ctx.moveTo(gx0 + gw / 2, 28);
      ctx.lineTo(gx0 + gw / 2, h - 10);
      ctx.stroke();

      ctx.strokeStyle = '#22c55e';
      ctx.lineWidth = 1;
      const nx = gx0 + ((now - start) / (24 * 60 * 60 * 1000)) * gw;
      ctx.beginPath();
      ctx.moveTo(nx, 28);
      ctx.lineTo(nx, h - 10);
      ctx.stroke();

      agents.forEach((ag, idx) => {
        const y = 36 + idx * rowH;
        ctx.fillStyle = '#374151';
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillText(ag.slice(0, 22), 8, y + 10);

        const subset = tasks.filter((t) => t.agentId === ag);
        for (const t of subset) {
          const c0 = new Date(t.createdAt).getTime();
          const c1 = new Date(t.updatedAt).getTime();
          const x0 = gx0 + ((Math.max(c0, start) - start) / (24 * 60 * 60 * 1000)) * gw;
          const x1 = gx0 + ((Math.min(c1, now) - start) / (24 * 60 * 60 * 1000)) * gw;
          const st = String(t.status || '').toLowerCase();
          let color = '#9ca3af';
          if (st === 'running') color = '#3b82f6';
          else if (st === 'completed') color = '#22c55e';
          else if (st === 'failed') color = '#ef4444';
          ctx.fillStyle = color;
          ctx.fillRect(x0, y + 4, Math.max(3, x1 - x0), 12);
        }
      });

      ctx.fillStyle = '#6b7280';
      ctx.font = '9px system-ui';
      ctx.fillText('−24h', gx0, 20);
      ctx.fillText('maintenant', gx1 - 52, 20);
    }

    paint();
    const ro = new ResizeObserver(() => paint());
    ro.observe(wrapEl);
    return () => ro.disconnect();
  }, [tasks]);

  return (
    <div ref={wrapRef} class="w-full">
      <canvas ref={canvasRef} class="w-full rounded-[1.5rem] border border-gray-100" />
      <p class="text-[10px] text-gray-400 mt-2">Fenêtre glissante 24 h · barre verte = maintenant</p>
    </div>
  );
}
