import type { APIRoute } from 'astro';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

function dockerCliRowToContainer(row: Record<string, unknown>) {
  const names = String(row.Names || row.Name || '')
    .split(',')
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => (name.startsWith('/') ? name : `/${name}`));

  return {
    Id: String(row.ID || row.Id || ''),
    Names: names,
    Image: String(row.Image || ''),
    State: String(row.State || '').toLowerCase(),
    Status: String(row.Status || ''),
    Ports: [],
  };
}

async function readContainersFromDockerCli() {
  const { stdout } = await execFileAsync('docker', ['ps', '-a', '--format', '{{json .}}']);
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => dockerCliRowToContainer(JSON.parse(line) as Record<string, unknown>));
}

export const GET: APIRoute = async () => {
  try {
    const { stdout } = await execFileAsync('curl', ['-s', '--unix-socket', '/var/run/docker.sock', 'http://localhost/containers/json?all=1']);
    const containers = JSON.parse(stdout);
    return new Response(JSON.stringify(containers), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    try {
      const containers = await readContainersFromDockerCli();
      return new Response(JSON.stringify(containers), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    const { id, action } = data;
    
    if (!id || !action) {
      return new Response(JSON.stringify({ error: 'Missing id or action' }), { status: 400 });
    }

    const safePattern = /^[a-zA-Z0-9_.-]+$/;
    if (
      id.startsWith('-') || !safePattern.test(id) ||
      action.startsWith('-') || !safePattern.test(action)
    ) {
      return new Response(JSON.stringify({ error: 'Invalid input format' }), { status: 400 });
    }

    let url = '';
    let method = 'POST';
    
    if (action === 'remove') {
      url = `http://localhost/containers/${id}?v=1&force=1`;
      method = 'DELETE';
    } else {
      url = `http://localhost/containers/${id}/${action}`;
    }

    const { stdout } = await execFileAsync('curl', ['-s', '-X', method, '--unix-socket', '/var/run/docker.sock', url]);
    
    return new Response(JSON.stringify({ success: true, result: stdout }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: 'Internal server error occurred' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
