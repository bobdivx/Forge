import { fetchZimaOSAgentsList, getZimaOSClientDebugMeta, getZimaOSGatewayCandidateBases } from '../src/lib/zimaos-gateway.ts';
import { loadAstroDb } from '../src/lib/load-astro-db.ts';

async function test() {
  console.log('--- INSPECTION DE LA CONFIGURATION ---');
  
  const { db, Config, AgentInstruction } = await loadAstroDb();
  const allConfigs = await db.select().from(Config);
  
  console.log('Valeurs en Base de Données :');
  allConfigs.forEach(c => {
    console.log(`- ${c.key}: ${c.value}`);
  });

  const candidates = await getZimaOSGatewayCandidateBases();
  console.log('\nCandidates URLs Gateway:', candidates);

  const meta = await getZimaOSClientDebugMeta();
  console.log('URL Active choisie par Forge:', meta.gatewayBaseUrl);
  console.log('Source de l\'URL:', meta.urlSource);
  
  console.log('\n--- TENTATIVE DE CONNEXION AU GATEWAY ---');
  const agentsRes = await fetchZimaOSAgentsList();
  if (!agentsRes.ok) {
    console.error('ERREUR DE CONNEXION:', agentsRes.error);
    console.log('Détails:', agentsRes);
    return;
  }

  console.log(`SUCCÈS ! Le Gateway à ${meta.gatewayBaseUrl} connaît ${agentsRes.agents.length} agents.`);
}

test();
