const { execSync } = require('child_process');
const fs = require('fs');

function checkNAS() {
    console.log('--- VÉRIFICATION RAPIDE DU NAS ---');
    
    // Tentative de récupération de l'IP depuis la DB (simulée ici par une recherche dans les fichiers si possible)
    // Sinon on utilise l'IP par défaut ou on cherche dans zimaos-infra-client
    const ip = '10.0.0.32'; // On va tenter celle-là car elle est apparue dans les logs
    const keyPath = 'C:/Users/auber/Documents/GitHub/Forge/scratch/zimaos_db_key';
    
    if (!fs.existsSync(keyPath)) {
        console.error('Clé SSH Forge introuvable dans scratch/.');
        return;
    }

    const sshCmd = `ssh -i "${keyPath}" -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@${ip} "cat /DATA/AppData/zimaos/zimaos.json"`;
    
    try {
        console.log(`Tentative de lecture sur ${ip}...`);
        const output = execSync(sshCmd).toString();
        const config = JSON.parse(output);
        const agents = config.agents?.list || [];
        
        console.log(`\nSuccès ! ${agents.length} agents trouvés.`);
        agents.slice(0, 15).forEach(a => {
            console.log(`- Agent: ${a.id}, Modèle: ${a.model || 'MANQUANT'}`);
        });
        
    } catch (e) {
        console.error('Erreur SSH:', e.message);
    }
}

checkNAS();
