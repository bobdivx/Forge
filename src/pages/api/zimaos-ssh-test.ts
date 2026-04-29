import type { APIRoute } from 'astro';
import { getZimaOSInfraClient, ZimaOSInfraClient } from '../../lib/zimaos-infra-client';
import { getConfig } from '../../lib/config-db';

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ ok: false, message: 'Non authentifié' }), { status: 401 });
  }

  try {
    const infra = await getZimaOSInfraClient();
    const result = await infra.testConnection();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, message: e.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ ok: false, message: 'Non authentifié' }), { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const host = String(body.zimaosHost ?? '').trim();
    const user = String(body.zimaosSshUser ?? '').trim();
    const port = Number(body.zimaosSshPort ?? 22) || 22;
    const sshAuth = String(body.zimaosSshAuth ?? 'key').trim() === 'password' ? 'password' : 'key';
    const keyPath = String(body.zimaosSshKeyPath ?? '').trim();
    const keyContent = String(body.zimaosSshKeyContent ?? '').trim();
    const passwordInput = String(body.zimaosSshPassword ?? '').trim();
    const password =
      sshAuth === 'password' && !passwordInput
        ? String(await getConfig('zimaosSshPassword')).trim()
        : passwordInput;

    const infra = new ZimaOSInfraClient({
      mode: 'remote_ssh',
      host,
      user,
      port,
      sshAuth,
      keyPath,
      keyContent,
      password,
    });
    const result = await infra.testConnection();
    return new Response(
      JSON.stringify({
        ...result,
        debug: {
          via: 'request-payload',
          sshAuth,
          hasPassword: password.length > 0,
          hasKeyPath: keyPath.length > 0,
          hasKeyContent: keyContent.length > 0,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, message: e.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
