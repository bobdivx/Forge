import { useEffect, useRef, useState } from 'preact/hooks';
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';

type AgentRow = {
  id: string;
  status: string;
};

type Edge = { from: string; to: string };

type TaskStats = Record<string, { total?: number }>;

type SimNode = SimulationNodeDatum & {
  id: string;
  r: number;
  status: string;
};

export default function SwarmNetworkCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<Edge[]>([]);

  const [hydrated, setHydrated] = useState(0);
  const [discover, setDiscover] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const [agentsRes, swarmRes, logsRes] = await Promise.all([
          fetch('/api/agents'),
          fetch('/api/swarm-interactions'),
          fetch('/api/activity-log?limit=160'),
        ]);
        const agentsPayload = await agentsRes.json();
        const swarmPayload = await swarmRes.json();
        const logsPayload = await logsRes.json();
        if (!alive) return;

        const agents: AgentRow[] = Array.isArray(agentsPayload.agents) ? agentsPayload.agents : [];
        const stats: TaskStats =
          agentsPayload.taskStats && typeof agentsPayload.taskStats === 'object'
            ? agentsPayload.taskStats
            : {};
        const edges: Edge[] = Array.isArray(swarmPayload.edges) ? swarmPayload.edges : [];

        const nodes: SimNode[] = agents.map((ag) => {
          const n = stats[ag.id]?.total ?? 1;
          const r = 10 + Math.min(22, Math.sqrt(n) * 3);
          return { id: ag.id, r, status: ag.status };
        });

        const nodeById = new Map(nodes.map((n) => [n.id, n]));
        const links: SimulationLinkDatum<SimNode>[] = edges
          .map((e) => {
            const s = nodeById.get(e.from);
            const t = nodeById.get(e.to);
            if (!s || !t) return null;
            return { source: s, target: t } as SimulationLinkDatum<SimNode>;
          })
          .filter((x): x is SimulationLinkDatum<SimNode> => x != null);

        const wrap = wrapRef.current;
        const w = wrap?.clientWidth || 800;
        const h = 420;
        for (const n of nodes) {
          n.x = Math.random() * w;
          n.y = Math.random() * h;
        }

        const sim = forceSimulation<SimNode>(nodes)
          .force('link', forceLink<SimNode, SimulationLinkDatum<SimNode>>(links).id((d) => d.id).distance(100))
          .force('charge', forceManyBody().strength(-220))
          .force('center', forceCenter(w / 2, h / 2))
          .force('collide', forceCollide<SimNode>().radius((d) => d.r + 3));

        for (let i = 0; i < 280; i++) sim.tick();
        sim.stop();

        nodesRef.current = nodes;
        edgesRef.current = edges;

        const recent = new Set<string>();
        const now = Date.now();
        for (const l of logsPayload.logs || []) {
          const act = String(l.action || '');
          if (!act.includes('swarm.agent.proposed')) continue;
          const ts = l.createdAt ? new Date(l.createdAt).getTime() : 0;
          if (now - ts < 3600_000) recent.add(String(l.actorId || '').trim());
        }
        setDiscover(recent);
        setHydrated((x) => x + 1);
      } catch {
        /* ignore */
      }
    }
    void load();
    const id = window.setInterval(load, 20_000);
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
      const h = 420;
      canvasEl.width = Math.floor(w * dpr);
      canvasEl.height = Math.floor(h * dpr);
      canvasEl.style.width = `${w}px`;
      canvasEl.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = '#fafafa';
      ctx.fillRect(0, 0, w, h);

      const nodes = nodesRef.current;
      const edges = edgesRef.current;

      ctx.strokeStyle = 'rgba(23,91,55,0.22)';
      ctx.lineWidth = 1.25;
      for (const e of edges) {
        const a = nodes.find((n) => n.id === e.from);
        const b = nodes.find((n) => n.id === e.to);
        if (!a || !b || a.x == null || b.x == null) continue;
        ctx.beginPath();
        ctx.moveTo(a.x!, a.y!);
        ctx.lineTo(b.x!, b.y!);
        ctx.stroke();
      }

      for (const n of nodes) {
        if (n.x == null || n.y == null) continue;
        const active = n.status === 'actif';
        if (discover.has(n.id)) {
          ctx.globalAlpha = 0.35;
          ctx.beginPath();
          ctx.arc(n.x!, n.y!, n.r + 7, 0, Math.PI * 2);
          ctx.fillStyle = '#22c55e';
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        ctx.beginPath();
        ctx.arc(n.x!, n.y!, n.r, 0, Math.PI * 2);
        ctx.fillStyle = active ? '#175B37' : '#6B7280';
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.font = '700 9px ui-sans-serif,system-ui';
        const tag = n.id.replace(/_/g, ' ').slice(0, 3).toUpperCase();
        ctx.fillText(tag, n.x! - 11, n.y! + 3);
      }
    }

    paint();
    const ro = new ResizeObserver(() => paint());
    ro.observe(wrapEl);
    return () => ro.disconnect();
  }, [hydrated, discover]);

  return (
    <div ref={wrapRef} class="w-full">
      <canvas ref={canvasRef} class="w-full rounded-[1.5rem] border border-gray-100 bg-gray-50" />
      <p class="text-[10px] text-gray-400 mt-2 px-1">
        Réseau simplifié (parent → sous-agent). Pulsation verte : proposition agent récente dans le journal.
      </p>
    </div>
  );
}
