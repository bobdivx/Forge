import type { APIRoute } from 'astro';
import { execSync } from 'child_process';

export const GET: APIRoute = async () => {
  try {
    const raw = execSync('openclaw gateway call models.list --token casaos --json').toString();
    const data = JSON.parse(raw);
    return new Response(JSON.stringify(data.models || []), {
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
