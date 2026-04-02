import { db, AgentMessage, Project } from 'astro:db';

export async function GET() {
  try {
    const projects = await db.select().from(Project);
    const messages = await db.select().from(AgentMessage);
    return new Response(JSON.stringify({ 
      status: 'ok', 
      projects_count: projects.length, 
      messages_count: messages.length,
      tables_detected: true 
    }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ 
      status: 'error', 
      message: e.message 
    }), { status: 500 });
  }
}
