import type { APIRoute } from 'astro';
import { getConfig } from '../../../lib/config-db';
import {
  verifyGithubSignature256,
  handleGithubJulesPullRequest,
} from '../../../lib/jules-pr-webhook';

export const prerender = false;

/**
 * GitHub → Forge : événements `pull_request` dont l’auteur est Jules (app google-labs-jules).
 * Configure le dépôt : Webhook URL = https://<forge>/api/webhooks/github-jules
 * Événements : Pull requests uniquement. Secret : table Config `githubWebhookSecret` (Paramètres),
 * ou secours `GITHUB_WEBHOOK_SECRET`.
 */
export const GET: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      ok: true,
      service: 'github-jules-webhook',
      doc: 'POST avec X-GitHub-Event: pull_request, signature sha256 (secret Config ou .env).',
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};

export const POST: APIRoute = async ({ request }) => {
  const fromDb = (await getConfig('githubWebhookSecret')).trim();
  const secret = fromDb || process.env.GITHUB_WEBHOOK_SECRET?.trim() || '';
  if (!secret) {
    return new Response(
      JSON.stringify({
        error:
          'Secret webhook manquant : renseigner githubWebhookSecret (Paramètres → Jetons API) ou GITHUB_WEBHOOK_SECRET',
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  const rawBody = await request.text();
  const sig = request.headers.get('x-hub-signature-256');
  if (!verifyGithubSignature256(secret, rawBody, sig)) {
    return new Response(JSON.stringify({ error: 'Signature invalide' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: 'JSON invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const event = request.headers.get('x-github-event') || '';
  if (event !== 'pull_request') {
    return new Response(JSON.stringify({ ok: true, ignored: true, event }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const result = await handleGithubJulesPullRequest(payload);
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
