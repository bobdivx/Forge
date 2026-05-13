import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { getConfig } from './config-db';
import { getHostContext } from './forge-host-context';

export type ZimaOSInfraConfig = {
  mode: 'local' | 'remote_ssh';
  host?: string;
  user?: string;
  port?: number;
  sshAuth?: 'key' | 'password';
  password?: string;
  keyPath?: string;
  keyContent?: string;
  containerName?: string;
};

export async function getZimaOSInfraConfig(): Promise<ZimaOSInfraConfig> {
  const rawMode = (await getConfig('zimaosAccessMode')) || '';
  // Auto-détection : si la config est vide ou par défaut, on choisit selon l'hôte.
  let mode: 'local' | 'remote_ssh';
  if (rawMode === 'remote_ssh') mode = 'remote_ssh';
  else if (rawMode === 'local' || rawMode === 'local_docker') mode = 'local';
  else mode = getHostContext().defaultInfraMode;
  const host = await getConfig('zimaosHost');
  const user = await getConfig('zimaosSshUser');
  const port = Number(await getConfig('zimaosSshPort')) || 22;
  const sshAuth = ((await getConfig('zimaosSshAuth')) || 'key') === 'password' ? 'password' : 'key';
  const containerName = (await getConfig('zimaosContainerName')) || 'openclaw';
  const keyPath = await getConfig('zimaosSshKeyPath');
  const keyContent = await getConfig('zimaosSshKeyContent');
  const password = await getConfig('zimaosSshPassword');
  
  return { mode, host, user, port, sshAuth, containerName, keyPath, keyContent, password };
}

let _lastSshError: { timestamp: number; count: number } = { timestamp: 0, count: 0 };

function sanitizeSshErrorMessage(raw: string, password?: string): string {
  let out = String(raw || '');
  // Masque l'option plink -pw "...."
  out = out.replace(/-pw\s+"[^"]*"/gi, '-pw "***"');
  out = out.replace(/-pw\s+\S+/gi, '-pw "***"');
  // Masque toute occurrence brute du mot de passe si connue
  if (password) {
    out = out.split(password).join('***');
  }
  return out;
}

function buildSsh2ExecCommand(payloadBase64: string): string {
  return (
    `node -e "const { Client } = require('ssh2');` +
    `const raw = Buffer.from(process.env.FORGE_SSH2_PAYLOAD || '', 'base64').toString('utf8');` +
    `if (!raw) { console.error('Missing FORGE_SSH2_PAYLOAD'); process.exit(9); }` +
    `const cfg = JSON.parse(raw);` +
    `const conn = new Client();` +
    `let done = false;` +
    `const fail = (msg, code = 2) => { if (done) return; done = true; try { conn.end(); } catch {} ; console.error(msg); process.exit(code); };` +
    `conn.on('ready', () => {` +
    `conn.exec(cfg.command, (err, stream) => {` +
    `if (err) return fail('SSH exec failed: ' + err.message, 3);` +
    `stream.on('close', (code) => { try { conn.end(); } catch {} ; process.exit(code || 0); });` +
    `stream.on('data', (d) => process.stdout.write(d));` +
    `stream.stderr.on('data', (d) => process.stderr.write(d));` +
    `});` +
    `}).on('error', (err) => fail('SSH connect failed: ' + err.message, 4))` +
    `.connect(cfg.connect);" && exit 0`
  );
}

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

      const { host, user, port, keyPath, keyContent, password, sshAuth } = this.config as any;
      if (!host || !user) throw new Error('SSH host or user not configured');
      
      let effectiveKeyPath = keyPath;
      let execEnv: NodeJS.ProcessEnv | undefined = undefined;
      
      // Priorité au contenu clé DB (clé provisionnée/régénérée par Forge),
      // pour éviter qu'un ancien keyPath invalide soit utilisé.
      if (keyContent) {
        const tempKeyPath = 'scratch/zimaos_db_key';
        if (!fs.existsSync('scratch')) fs.mkdirSync('scratch');
        fs.writeFileSync(tempKeyPath, keyContent.trim() + '\n', { mode: 0o600 });
        effectiveKeyPath = tempKeyPath;
      }

      const identity = effectiveKeyPath ? `-i "${effectiveKeyPath.replace(/\\/g, '/')}"` : '';
      const escapedCommand = command.replace(/"/g, '\\"');
      let sshCmd = '';
      const wantPassword = sshAuth === 'password';

      // Auth explicitement demandée: mot de passe
      if (wantPassword && password) {
        const payload = Buffer.from(
          JSON.stringify({
            connect: {
              host: String(host),
              port: Number(port) || 22,
              username: String(user),
              password: String(password),
              readyTimeout: 5000,
            },
            command: String(command),
          }),
          'utf8',
        ).toString('base64');
        execEnv = { ...process.env, FORGE_SSH2_PAYLOAD: payload };
        sshCmd = buildSsh2ExecCommand(payload);
      } else if (wantPassword && !password) {
        throw new Error("SSH password auth sélectionnée, mais aucun mot de passe n'est enregistré.");
      } else if (effectiveKeyPath || keyContent) {
        // Auth par clé via ssh2 (évite les incompatibilités de format OpenSSH CLI).
        let privateKey = '';
        if (effectiveKeyPath) {
          try {
            privateKey = fs.readFileSync(effectiveKeyPath, 'utf-8');
          } catch (e: any) {
            throw new Error(`Lecture clé SSH impossible: ${e?.message || 'erreur inconnue'}`);
          }
        } else {
          privateKey = String(keyContent || '');
        }
        const payload = Buffer.from(
          JSON.stringify({
            connect: {
              host: String(host),
              port: Number(port) || 22,
              username: String(user),
              privateKey: String(privateKey),
              readyTimeout: 5000,
            },
            command: String(command),
          }),
          'utf8',
        ).toString('base64');
        execEnv = { ...process.env, FORGE_SSH2_PAYLOAD: payload };
        sshCmd = buildSsh2ExecCommand(payload);
      } else if (password) {
        // Fallback compat: mot de passe présent mais mode non explicite.
        const payload = Buffer.from(
          JSON.stringify({
            connect: {
              host: String(host),
              port: Number(port) || 22,
              username: String(user),
              password: String(password),
              readyTimeout: 5000,
            },
            command: String(command),
          }),
          'utf8',
        ).toString('base64');
        execEnv = { ...process.env, FORGE_SSH2_PAYLOAD: payload };
        sshCmd = buildSsh2ExecCommand(payload);
      } else {
        sshCmd = `ssh -p ${port} -o BatchMode=yes -o ConnectTimeout=5 -o StrictHostKeyChecking=no ${user}@${host} "${escapedCommand}"`;
      }
      
      try {
        const res = execSync(sshCmd, { encoding: 'utf-8', windowsHide: true, env: execEnv || process.env });
        // Succès: on reset le compteur d'erreurs
        _lastSshError = { timestamp: 0, count: 0 };
        return res;
      } catch (e: any) {
        _lastSshError.timestamp = Date.now();
        _lastSshError.count++;
        const msg = sanitizeSshErrorMessage(e?.message, password);
        if (/Cannot parse privateKey|Unsupported key format/i.test(msg)) {
          throw new Error(
            "SSH exec failed: format de clé privée incompatible. Utilisez 'Régénérer la clé SSH' dans Settings > ZimaOS.",
          );
        }
        throw new Error(`SSH exec failed: ${msg}`);
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
    const name = this.config.containerName || 'forge-gateway';
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
