import type { APIRoute } from 'astro';
import { spawn } from 'child_process';
import { isValidAppName } from '../../lib/auth';
import { getZimaOSToken } from '../../lib/zimaos-gateway';

export const POST: APIRoute = async ({ request, locals }) => {
  const data = await request.json();
  const name = String(data?.name ?? '').trim();

  if (!isValidAppName(name)) {
    return new Response(JSON.stringify({ error: 'Nom invalide' }), { status: 400 });
  }

  const zimaosToken = await getZimaOSToken();
  if (!zimaosToken) {
    return new Response(JSON.stringify({ error: 'Token ZimaOS manquant pour cet utilisateur' }), { status: 400 });
  }

  const result = await new Promise<{ error?: string }>((resolve) => {
    const child = spawn('zimaos', ['task', `CREATE_NEW_APP ${name}`], {
      env: {
        ...process.env,
        ZIMAOS_GATEWAY_TOKEN: zimaosToken
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
        resolve({ error: stderr || `zimaos exited with code ${code}` });
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
