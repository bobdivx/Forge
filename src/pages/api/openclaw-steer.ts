import type { APIRoute } from 'astro';
import { execSync } from 'child_process';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { sessionKey, model } = await request.json();
    if (!sessionKey || !model) {
      return new Response(JSON.stringify({ error: 'Missing params' }), { status: 400 });
    }

    const params = JSON.stringify({ sessionKey, model });
    const cmd = `openclaw gateway call sessions.steer --token casaos --params '${params.replace(/'/g, "'\\''")}' --json`;
    const raw = execSync(cmd).toString();
    
    return new Response(raw, {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
