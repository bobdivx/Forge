import type { APIRoute } from 'astro';
import { spawn } from 'child_process';
import { getOpenClawToken, isValidAppName } from '../../lib/auth';

export const POST: APIRoute = async ({ request, locals }) => {
  const data = await request.json();
  const name = String(data?.name ?? '').trim();

  if (!isValidAppName(name)) {
    return new Response(JSON.stringify({ error: 'Nom invalide' }), { status: 400 });
  }

  const email = locals.user?.email;
  const openclawToken = getOpenClawToken(email);
  if (!openclawToken) {
    return new Response(JSON.stringify({ error: 'Token OpenClaw manquant pour cet utilisateur' }), { status: 400 });
  }

  const result = await new Promise<{ error?: string }>((resolve) => {
    const child = spawn('openclaw', ['task', `CREATE_NEW_APP ${name}`], {
      env: {
        ...process.env,
        OPENCLAW_GATEWAY_TOKEN: openclawToken
      },
      shell: false
    });

    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (err) => {
      resolve({ error: err.message });
    });
    child.on('close', (code) => {
      if (code !== 0) {
        resolve({ error: stderr || `openclaw exited with code ${code}` });
        return;
      }
      resolve({});
    });
  });

  if (result.error) {
    return new Response(JSON.stringify({ error: result.error }), { status: 500 });
  }

  return new Response(JSON.stringify({ status: 'started', app: name }), { status: 200 });
};
