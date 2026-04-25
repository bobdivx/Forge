import type { APIRoute } from 'astro';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const GET: APIRoute = async () => {
  try {
    const { stdout } = await execAsync('curl -s --unix-socket /var/run/docker.sock http://localhost/containers/json?all=1');
    const containers = JSON.parse(stdout);
    return new Response(JSON.stringify(containers), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const { id, action } = data;
    
    if (!id || !action) {
      return new Response(JSON.stringify({ error: 'Missing id or action' }), { status: 400 });
    }

    let url = '';
    let method = 'POST';
    
    if (action === 'remove') {
      url = `http://localhost/containers/${id}?v=1&force=1`;
      method = 'DELETE';
    } else {
      url = `http://localhost/containers/${id}/${action}`;
    }

    const { stdout } = await execAsync(`curl -s -X ${method} --unix-socket /var/run/docker.sock "${url}"`);
    
    return new Response(JSON.stringify({ success: true, result: stdout }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
