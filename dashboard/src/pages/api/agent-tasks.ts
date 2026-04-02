import type { APIRoute } from 'astro';
import { db, AgentTask, desc } from 'astro:db';

export const GET: APIRoute = async () => {
  try {
    const tasks = await db.select().from(AgentTask).orderBy(desc(AgentTask.createdAt)).limit(50);
    return new Response(JSON.stringify({ tasks }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
