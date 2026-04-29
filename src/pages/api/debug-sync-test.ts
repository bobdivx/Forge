import type { APIRoute } from 'astro';
import { performZimaOSAgentsSync } from './zimaos-sync-agents';
import { getZimaOSInfraClient } from '../../lib/zimaos-infra-client';

export const GET: APIRoute = async () => {
  console.log('[DEBUG] Lancement de la synchronisation forcée via API...');
  
  try {
    // On passe un paramètre fictif pour éviter le restart automatique si le moteur le permet, 
    // ou on modifie la logique pour ce test.
    const syncResult = await performZimaOSAgentsSync("NO_RESTART");
    
    // Vérification directe sur le NAS via SSH
    const infra = await getZimaOSInfraClient();
    const probePaths = [
      'C:/DATA/AppData/zimaos/zimaos.json',
      '/DATA/AppData/zimaos/zimaos.json',
      'X:/AppData/zimaos/zimaos.json'
    ];
    
    let foundPath = null;
    let configSnapshot = null;
    
    for (const p of probePaths) {
      if (infra.exists(p)) {
        foundPath = p;
        configSnapshot = JSON.parse(infra.readFile(p));
        break;
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      syncResult,
      nasConfig: {
        path: foundPath,
        agentsCount: configSnapshot?.agents?.list?.length || 0,
        sample: configSnapshot?.agents?.list?.slice(0, 3) || []
      }
    }), { status: 200 });
    
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500 });
  }
};
