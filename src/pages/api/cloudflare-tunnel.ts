import type { APIRoute } from 'astro';
import { getConfig } from '../../lib/config-db';

const PUBLISH_ZONE = 'briseteia.me';

function slugifySubdomain(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

function isValidDnsLabel(label: string): boolean {
  if (label.length < 1 || label.length > 63) return false;
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label);
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const appName = typeof body?.appName === 'string' ? body.appName : '';
    const action = typeof body?.action === 'string' ? body.action : '';
    const fromBody = slugifySubdomain(body?.subdomain);
    const fallback = slugifySubdomain(appName.split('/').pop() || appName);
    const hostLabel = fromBody || fallback;

    if (!appName || !action) {
      return new Response(JSON.stringify({ error: 'appName et action requis' }), { status: 400 });
    }

    if (!isValidDnsLabel(hostLabel)) {
      return new Response(
        JSON.stringify({
          error:
            'Sous-domaine invalide : lettres minuscules, chiffres et tirets uniquement (1–63 caractères, sans tiret en début ou fin).',
        }),
        { status: 400 },
      );
    }

    const token = await getConfig('cloudflareToken', true);
    
    if (!token || token.trim() === '') {
      return new Response(JSON.stringify({ 
        error: 'Aucun jeton Cloudflare configuré. Veuillez l\'ajouter dans les Paramètres > Jetons API.' 
      }), { status: 400 });
    }

    // This is a placeholder for the actual Cloudflare API logic.
    // In a real scenario, this would use the token to talk to https://api.cloudflare.com/client/v4/accounts/...
    // to create a DNS record and route it to the local cloudflared tunnel instance.
    
    if (action === 'publish') {
      // Logic to publish
      // 1. Check if tunnel exists
      // 2. Create DNS route for {hostLabel}.PUBLISH_ZONE -> Tunnel
      // 3. Update local cloudflared ingress rules
      
      // For now, returning a simulated success since actual Cloudflare account IDs / Tunnel IDs are needed 
      // for the real API calls which require user setup first.
      
      return new Response(JSON.stringify({ 
        status: 'ok', 
        message: `Simulation : création de route Cloudflare Tunnel pour https://${hostLabel}.${PUBLISH_ZONE} → service local (voir cloudflared).`,
        url: `https://${hostLabel}.${PUBLISH_ZONE}`,
        subdomain: hostLabel,
        zone: PUBLISH_ZONE,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else if (action === 'unpublish') {
       return new Response(JSON.stringify({ 
        status: 'ok', 
        message: `Supprimée (simulation) : route DNS / ingress pour https://${hostLabel}.${PUBLISH_ZONE}.`,
        subdomain: hostLabel,
        zone: PUBLISH_ZONE,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Action inconnue' }), { status: 400 });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Erreur serveur Cloudflare' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
