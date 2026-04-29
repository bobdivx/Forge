import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ ok: false, message: 'Non authentifié' }), { status: 401 });
  }

  const platform = process.platform;

  return new Response(
    JSON.stringify({
      ok: true,
      platform,
      transport: 'ssh2-node',
      message: `Runtime ${platform}: transport SSH natif via Node (ssh2), sans dépendance plink/sshpass.`,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
