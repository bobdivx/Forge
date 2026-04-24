import type { APIRoute } from 'astro';
import { getConfig } from '../../lib/config-db';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { appName, action } = await request.json();

    if (!appName || !action) {
      return new Response(JSON.stringify({ error: 'appName et action requis' }), { status: 400 });
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
      // 2. Create DNS route for appName.briseteia.me -> Tunnel
      // 3. Update local cloudflared ingress rules
      
      // For now, returning a simulated success since actual Cloudflare account IDs / Tunnel IDs are needed 
      // for the real API calls which require user setup first.
      
      return new Response(JSON.stringify({ 
        status: 'ok', 
        message: 'Simulation: Demande envoyée à Cloudflare API',
        url: `https://${appName.toLowerCase()}.briseteia.me`
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else if (action === 'unpublish') {
       return new Response(JSON.stringify({ 
        status: 'ok', 
        message: 'Simulation: Route supprimée de Cloudflare API'
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
