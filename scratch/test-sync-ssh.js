import { performZimaOSAgentsSync } from '../src/pages/api/zimaos-sync-agents.ts';
import { getZimaOSInfraClient } from '../src/lib/zimaos-infra-client.ts';
import { loadAstroDb } from '../src/lib/load-astro-db.ts';

async function runTest() {
  console.log('--- TEST DE SYNCHRONISATION SSH ---');
  
  try {
    const result = await performZimaOSAgentsSync();
    console.log('Résultat de la sync:', JSON.stringify(result, null, 2));
    
    if (result.ok) {
      console.log('\n--- VÉRIFICATION DU FICHIER SUR LE NAS ---');
      const infra = await getZimaOSInfraClient();
      
      // On essaie de lire zimaos.json pour voir si les modèles y sont
      const probePaths = [
        'C:/DATA/AppData/zimaos/zimaos.json',
        '/DATA/AppData/zimaos/zimaos.json',
        'X:/AppData/zimaos/zimaos.json'
      ];
      
      let foundPath = null;
      for (const p of probePaths) {
        if (infra.exists(p)) {
          foundPath = p;
          break;
        }
      }
      
      if (foundPath) {
        const content = infra.readFile(foundPath);
        const config = JSON.parse(content);
        const agents = config.agents?.list || [];
        console.log(`Fichier trouvé à : ${foundPath}`);
        console.log('Extrait du registre des agents sur le NAS :');
        agents.slice(0, 5).forEach(a => {
          console.log(`- Agent: ${a.id}, Modèle: ${a.model || 'MANQUANT !'}`);
        });
        
        const hasModels = agents.every(a => a.model);
        if (hasModels) {
          console.log('\n✅ SUCCÈS : Tous les agents ont un modèle Ollama configuré sur le NAS.');
        } else {
          console.error('\n❌ ÉCHEC : Certains agents n\'ont toujours pas de modèle.');
        }
      } else {
        console.error('Impossible de trouver zimaos.json sur le NAS pour vérification.');
      }
    }
  } catch (e) {
    console.error('Erreur pendant le test:', e);
  }
}

runTest();
