import type { APIRoute } from 'astro';
import { db, AgentTask, AgentMessage, desc } from 'astro:db';

export const GET: APIRoute = async () => {
  try {
    const tasks = await db.select().from(AgentTask).orderBy(desc(AgentTask.createdAt)).limit(50);
    const messages = await db.select().from(AgentMessage).orderBy(desc(AgentMessage.timestamp)).limit(50);

    const mergedLogs = [
      ...tasks.map((task) => ({
        id: `task-${task.id}`,
        type: 'task',
        agent: task.agentId,
        content: task.task,
        input: task.input,
        output: task.output,
        status: task.status,
        timestamp: task.createdAt,
      })),
      ...messages.map((msg) => ({
        id: `msg-${msg.id}`,
        type: 'message',
        agent: msg.fromAgent,
        to: msg.toAgent,
        content: msg.content,
        timestamp: msg.timestamp,
      }))
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 50);

    return new Response(JSON.stringify({ logs: mergedLogs }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch logs' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
