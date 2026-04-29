const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Simulation ultra-lite du client SSH pour lecture seule
function checkNAS() {
    console.log('--- VÉRIFICATION RAPIDE DU NAS ---');
    
    // On essaie de trouver la clé SSH matérialisée par Forge
    const keyPath = 'C:/Users/auber/Documents/GitHub/Forge/scratch/zimaos_db_key';
    if (!fs.existsSync(keyPath)) {
        console.error('Clé SSH Forge introuvable dans scratch/.');
        return;
    }

    const sshCmd = `ssh -i "${keyPath}" -o StrictHostKeyChecking=no -o ConnectTimeout=5 root@10.0.0.32 "cat /DATA/AppData/zimaos/zimaos.json"`;
    
    try {
        console.log('Lecture de zimaos.json via SSH...');
        const output = execSync(sshCmd).toString();
        const config = JSON.parse(output);
        const agents = config.agents?.list || [];
        
        console.log(`\nSuccès ! ${agents.length} agents trouvés sur le NAS.`);
        agents.forEach(a => {
            console.log(`- Agent: ${a.id}, Modèle: ${a.model || 'MANQUANT'}`);
        });
        
    } catch (e) {
        console.error('Erreur SSH:', e.message);
    }
}

checkNAS();
