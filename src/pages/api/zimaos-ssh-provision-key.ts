import type { APIRoute } from 'astro';
import ssh2Pkg from 'ssh2';
import { getConfig, setConfig } from '../../lib/config-db';
import { resetZimaOSInfraClient } from '../../lib/zimaos-infra-client';
import fs from 'node:fs';

const { Client, utils: ssh2Utils } = ssh2Pkg as unknown as {
  Client: any;
  utils: any;
};

function q(value: string): string {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function sshExec(conn: any, command: string): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    conn.exec(command, (err: unknown, stream: any) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      let code = 0;
      stream.on('data', (d: Buffer | string) => {
        stdout += String(d);
      });
      stream.stderr.on('data', (d: Buffer | string) => {
        stderr += String(d);
      });
      stream.on('close', (c?: number) => {
        code = Number(c || 0);
        resolve({ stdout, stderr, code });
      });
    });
  });
}

async function verifyKeyLogin(host: string, port: number, user: string, privateKey: string): Promise<boolean> {
  const conn = new Client();
  try {
    await new Promise<void>((resolve, reject) => {
      conn
        .on('ready', () => resolve())
        .on('error', (e: unknown) => reject(e))
        .connect({
          host,
          port,
          username: user,
          privateKey,
          readyTimeout: 8000,
        });
    });
    const res = await sshExec(conn, 'echo OK');
    return res.code === 0 && /OK/.test(res.stdout);
  } catch {
    return false;
  } finally {
    conn.end();
  }
}

function generateOpenSshKeyPair(comment: string): Promise<{ privateKey: string; publicKey: string }> {
  return new Promise((resolve, reject) => {
    ssh2Utils.generateKeyPair('ed25519', { comment }, (err: unknown, keys: any) => {
      if (err) return reject(err);
      const privateKey = String((keys as any)?.private || '').trim();
      const publicKey = String((keys as any)?.public || '').trim();
      if (!privateKey || !publicKey) {
        return reject(new Error('Génération de clé SSH incomplète.'));
      }
      resolve({ privateKey: `${privateKey}\n`, publicKey });
    });
  });
}

export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ ok: false, message: 'Non authentifié' }), { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const host = String(body.zimaosHost ?? '').trim() || String(await getConfig('zimaosHost')).trim();
    const user = String(body.zimaosSshUser ?? '').trim() || String(await getConfig('zimaosSshUser')).trim();
    const port = Number(body.zimaosSshPort ?? (await getConfig('zimaosSshPort')) ?? 22) || 22;
    const passwordInput = String(body.zimaosSshPassword ?? '').trim();
    const password = passwordInput || String(await getConfig('zimaosSshPassword')).trim();
    const keyPathInput = String(body.zimaosSshKeyPath ?? '').trim();
    const keyContentInput = String(body.zimaosSshKeyContent ?? '').trim();
    const keyPath = keyPathInput || String(await getConfig('zimaosSshKeyPath')).trim();
    const keyContent = keyContentInput || String(await getConfig('zimaosSshKeyContent')).trim();
    const rotate = Boolean(body.rotate);

    if (!host || !user) {
      return new Response(JSON.stringify({ ok: false, message: 'Hôte/utilisateur SSH manquants.' }), { status: 200 });
    }
    const marker = `forge@${locals.user.email}`;
    const { privateKey, publicKey } = await generateOpenSshKeyPair(marker);

    const conn = new Client();
    let privateKeyForConnect = '';
    if (!password) {
      if (keyContent) {
        privateKeyForConnect = keyContent;
      } else if (keyPath) {
        try {
          privateKeyForConnect = fs.readFileSync(keyPath, 'utf-8');
        } catch {
          privateKeyForConnect = '';
        }
      }
    }
    if (!password && !privateKeyForConnect) {
      return new Response(
        JSON.stringify({
          ok: false,
          message: 'Aucun secret SSH disponible: renseignez un mot de passe ou une clé privée pour provisionner.',
        }),
        { status: 200 },
      );
    }
    await new Promise<void>((resolve, reject) => {
      conn
        .on('ready', () => resolve())
        .on('error', (e: unknown) => reject(e))
        .connect({
          host,
          port,
          username: user,
          ...(password ? { password } : { privateKey: privateKeyForConnect }),
          readyTimeout: 8000,
        });
    });

    try {
      const pubLineEsc = q(publicKey);
      const setupCmd = [
        'set -e',
        'umask 077',
        'mkdir -p ~/.ssh',
        'touch ~/.ssh/authorized_keys',
        ...(rotate
          ? [
              // Supprime toutes les clés Forge précédentes avant d'ajouter la nouvelle
              `grep -v ' forge@' ~/.ssh/authorized_keys > ~/.ssh/authorized_keys.tmp || true`,
              'mv ~/.ssh/authorized_keys.tmp ~/.ssh/authorized_keys',
            ]
          : []),
        `grep -Fqx ${pubLineEsc} ~/.ssh/authorized_keys || echo ${pubLineEsc} >> ~/.ssh/authorized_keys`,
        'chmod 700 ~/.ssh',
        'chmod 600 ~/.ssh/authorized_keys',
        'echo OK',
      ].join(' && ');

      const res = await sshExec(conn, `bash -lc ${q(setupCmd)}`);
      if (res.code !== 0 || !/OK/.test(res.stdout)) {
        return new Response(
          JSON.stringify({
            ok: false,
            message: `Provisioning SSH échoué: ${String(res.stderr || res.stdout || 'erreur distante').trim()}`,
          }),
          { status: 200 },
        );
      }

      const keyLoginOk = await verifyKeyLogin(host, port, user, privateKey);
      if (!keyLoginOk) {
        return new Response(
          JSON.stringify({
            ok: false,
            message:
              "La clé a été installée mais l'authentification par clé a échoué. Vérifiez la configuration SSH distante (PubkeyAuthentication/AuthorizedKeysFile), puis réessayez.",
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      await setConfig({
        zimaosAccessMode: 'remote_ssh',
        zimaosHost: host,
        zimaosSshUser: user,
        zimaosSshPort: String(port),
        zimaosSshAuth: 'key',
        zimaosSshKeyPath: '',
        zimaosSshKeyContent: privateKey,
      });
      resetZimaOSInfraClient();

      return new Response(
        JSON.stringify({
          ok: true,
          message: rotate
            ? 'Clé SSH régénérée, anciennes clés Forge retirées, puis installée sur ZimaOS.'
            : 'Clé SSH provisionnée sur ZimaOS et enregistrée dans Forge.',
          debug: { host, user, port, auth: 'key' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    } finally {
      conn.end();
    }
  } catch (e: any) {
    return new Response(
      JSON.stringify({
        ok: false,
        message: e?.message || 'Provisioning SSH impossible',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
};

