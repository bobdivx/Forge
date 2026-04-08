import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  try {
    const { db, Project, AgentTask, Request, eq } = await import('astro:db');
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [projects, tasksAll, tasksToday, openRequests] = await Promise.all([
      db.select().from(Project),
      db.select().from(AgentTask),
      db.select().from(AgentTask),
      db.select().from(Request).where(eq(Request.status, 'pending')),
    ]);

    const tasksTodayCount = tasksAll.filter((t) => {
      const d = t.createdAt instanceof Date ? t.createdAt : new Date(t.createdAt as any);
      return d >= today;
    }).length;

    return new Response(
      JSON.stringify({
        projectCount: projects.length,
        tasksTotal: tasksAll.length,
        tasksToday: tasksTodayCount,
        openRequests: openRequests.length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch {
    return new Response(
      JSON.stringify({ projectCount: 0, tasksTotal: 0, tasksToday: 0, openRequests: 0 }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
