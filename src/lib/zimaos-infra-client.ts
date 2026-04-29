import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { getConfig } from './config-db';

export type ZimaOSInfraConfig = {
  mode: 'local' | 'remote_ssh';
  host?: string;
  user?: string;
  port?: number;
  password?: string;
  keyPath?: string;
  keyContent?: string;
  containerName?: string;
};

export async function getZimaOSInfraConfig(): Promise<ZimaOSInfraConfig> {
  const mode = (await getConfig('zimaosAccessMode')) === 'remote_ssh' ? 'remote_ssh' : 'local';
  const host = await getConfig('zimaosHost');
  const user = await getConfig('zimaosSshUser');
  const port = Number(await getConfig('zimaosSshPort')) || 22;
  const containerName = (await getConfig('zimaosContainerName')) || 'openclaw';
  const keyPath = await getConfig('zimaosSshKeyPath');
  const keyContent = await getConfig('zimaosSshKeyContent');
  const password = await getConfig('zimaosSshPassword');
  
  return { mode, host, user, port, containerName, keyPath, keyContent, password };
}

let _lastSshError: { timestamp: number; count: number } = { timestamp: 0, count: 0 };

export class ZimaOSInfraClient {
  constructor(private config: ZimaOSInfraConfig) {}

  /**
   * Exécute une commande sur l'hôte ZimaOS (local ou distant).
   */
  exec(command: string): string {
    if (this.config.mode === 'local') {
      try {
        return execSync(command, { encoding: 'utf-8', windowsHide: true });
      } catch (e: any) {
        throw new Error(`Local exec failed: ${e.message}`);
      }
    } else {
      // Circuit Breaker: si trop d'erreurs SSH, on bloque temporairement
      const now = Date.now();
      if (_lastSshError.count >= 3 && now - _lastSshError.timestamp < 60000) {
        const remaining = Math.ceil((60000 - (now - _lastSshError.timestamp)) / 1000);
        throw new Error(`SSH bloqué temporairement (Permission denied). Réessayez dans ${remaining}s ou vérifiez le chemin de votre clé SSH.`);
      }

      const { host, user, port, keyPath, keyContent } = this.config as any;
      if (!host || !user) throw new Error('SSH host or user not configured');
      
      let effectiveKeyPath = keyPath;
      
      // Si on a du contenu en DB mais pas de chemin, on matérialise la clé
      if (!effectiveKeyPath && keyContent) {
        const tempKeyPath = 'scratch/zimaos_db_key';
        if (!fs.existsSync('scratch')) fs.mkdirSync('scratch');
        fs.writeFileSync(tempKeyPath, keyContent.trim() + '\n', { mode: 0o600 });
        effectiveKeyPath = tempKeyPath;
      }

      const identity = effectiveKeyPath ? `-i "${effectiveKeyPath.replace(/\\/g, '/')}"` : '';
      const sshCmd = `ssh -p ${port} ${identity} -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=no ${user}@${host} "${command.replace(/"/g, '\\"')}"`;
      
      try {
        const res = execSync(sshCmd, { encoding: 'utf-8', windowsHide: true });
        // Succès: on reset le compteur d'erreurs
        _lastSshError = { timestamp: 0, count: 0 };
        return res;
      } catch (e: any) {
        _lastSshError.timestamp = Date.now();
        _lastSshError.count++;
        throw new Error(`SSH exec failed (Permission denied?): ${e.message}`);
      }
    }
  }

  /**
   * Teste la connexion SSH explicitement.
   */
  async testConnection(): Promise<{ ok: boolean; message: string }> {
    if (this.config.mode === 'local') return { ok: true, message: 'Mode local (pas de SSH)' };
    try {
      // Reset pour le test forcé
      _lastSshError = { timestamp: 0, count: 0 };
      const out = this.exec('echo "OK"');
      return { ok: out.trim() === 'OK', message: 'Connexion SSH réussie !' };
    } catch (e: any) {
      return { ok: false, message: e.message };
    }
  }

  /**
   * Lit un fichier texte.
   */
  readFile(path: string): string {
    if (this.config.mode === 'local') {
      return fs.readFileSync(path, 'utf-8');
    } else {
      return this.exec(`cat "${path}"`);
    }
  }

  /**
   * Écrit un fichier texte.
   */
  writeFile(path: string, content: string): void {
    if (this.config.mode === 'local') {
      fs.writeFileSync(path, content, 'utf-8');
    } else {
      // Pour l'écriture via SSH, on utilise cat avec un heredoc pour gérer les multi-lignes
      // On utilise une version simple pour éviter les problèmes de quotes complexes
      const escapedContent = content.replace(/'/g, "'\\''");
      this.exec(`printf '%s' '${escapedContent}' > "${path}"`);
    }
  }

  /**
   * Vérifie l'existence d'un fichier.
   */
  exists(path: string): boolean {
    if (this.config.mode === 'local') {
      return fs.existsSync(path);
    } else {
      try {
        this.exec(`test -f "${path}"`);
        return true;
      } catch {
        return false;
      }
    }
  }

  /**
   * Redémarre le conteneur gateway.
   */
  restartContainer(): string {
    const name = this.config.containerName || 'zimaos-gateway';
    return this.exec(`docker restart ${name}`);
  }
}

let _clientPromise: Promise<ZimaOSInfraClient> | null = null;

export function getZimaOSInfraClient(): Promise<ZimaOSInfraClient> {
  if (_clientPromise) return _clientPromise;
  _clientPromise = getZimaOSInfraConfig().then(cfg => new ZimaOSInfraClient(cfg));
  return _clientPromise;
}

/**
 * Reset le client (utile si la config change en DB).
 */
export function resetZimaOSInfraClient() {
  _clientPromise = null;
}
