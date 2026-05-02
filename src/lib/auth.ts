/**
 * Authentification : utilisateurs (table ForgeUser) + secret de session (Config).
 * Migration ponctuelle depuis auth.json / config.json si ForgeUser est vide.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { CONFIG_DEFAULTS } from './config-db';
import { loadAstroDb } from './load-astro-db';

const SESSION_DURATION_MS = 1000 * 60 * 60 * 12;

/**
 * Cookie `Secure` : en prod sur HTTPS uniquement. Sur `http://localhost` même en
 * `NODE_ENV=production`, sans Secure le navigateur envoie bien le cookie (sinon session
 * « invisible » après connexion).
 */
export function forgeSessionCookieSecure(requestUrl: string): boolean {
  if (process.env.NODE_ENV !== 'production') return false;
  try {
    const u = new URL(requestUrl);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return false;
  } catch {
    return false;
  }
  return true;
}

function randomHex(size = 32): string {
  return crypto.randomBytes(size).toString('hex');
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function legacyAuthPath(): string {
  const env = process.env.FORGE_DATA_PATH?.trim();
  if (env) return path.join(env, 'auth.json');
  if (fs.existsSync('/media/Github/Forge/instructions')) return '/media/Github/Forge/instructions/auth.json';
  if (fs.existsSync('/media/GitHub/Forge/instructions')) return '/media/GitHub/Forge/instructions/auth.json';
  return '/mnt/GitHub/Forge/instructions/auth.json';
}

function legacyConfigPath(): string {
  const env = process.env.FORGE_DATA_PATH?.trim();
  if (env) return path.join(env, 'config.json');
  if (fs.existsSync('/media/Github/Forge/instructions')) return '/media/Github/Forge/instructions/config.json';
  if (fs.existsSync('/media/GitHub/Forge/instructions')) return '/media/GitHub/Forge/instructions/config.json';
  return '/mnt/GitHub/Forge/instructions/config.json';
}

/**
 * Si aucun utilisateur en DB : importe auth.json (+ secret session + config.json métier).
 * Idempotent ; adapté au premier démarrage après migration code.
 */
export async function migrateLegacyAuthOnce(): Promise<void> {
  try {
    const { db, ForgeUser, Config } = await loadAstroDb();
    const anyUser = await db.select().from(ForgeUser).limit(1);
    if (anyUser.length) return;

    const authPath = legacyAuthPath();
    if (fs.existsSync(authPath)) {
      const store = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
      if (store.sessionSecret && typeof store.sessionSecret === 'string') {
        const sec = await db.select().from(Config).where(eq(Config.key, 'sessionSecret'));
        if (!sec.length) {
          await db.insert(Config).values({
            key: 'sessionSecret',
            value: store.sessionSecret,
            updatedAt: new Date(),
          });
        }
      }
      const now = new Date();
      const usersToAdd: { email: string; salt: string; passwordHash: string }[] = [];
      if (store.users && typeof store.users === 'object') {
        for (const u of Object.values(store.users) as { email?: string; salt?: string; passwordHash?: string }[]) {
          if (u?.email && u?.salt && u?.passwordHash) {
            usersToAdd.push({
              email: String(u.email).trim().toLowerCase(),
              salt: u.salt,
              passwordHash: u.passwordHash,
            });
          }
        }
      }
      if (!usersToAdd.length && store.user?.email && store.user?.salt && store.user?.passwordHash) {
        usersToAdd.push({
          email: String(store.user.email).trim().toLowerCase(),
          salt: store.user.salt,
          passwordHash: store.user.passwordHash,
        });
      }
      for (const u of usersToAdd) {
        try {
          await db.insert(ForgeUser).values({
            email: u.email,
            salt: u.salt,
            passwordHash: u.passwordHash,
            createdAt: now,
            updatedAt: now,
          });
        } catch {
          /* doublon */
        }
      }
    }

    const cfgPath = legacyConfigPath();
    if (fs.existsSync(cfgPath)) {
      const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as Record<string, unknown>;
      for (const key of Object.keys(CONFIG_DEFAULTS) as (keyof typeof CONFIG_DEFAULTS)[]) {
        const val = cfg[key as string];
        if (typeof val !== 'string' || !val.trim()) continue;
        const row = await db.select().from(Config).where(eq(Config.key, key as string));
        if (!row.length) {
          await db.insert(Config).values({
            key: key as string,
            value: val.trim(),
            updatedAt: new Date(),
          });
        }
      }
    }
  } catch (e) {
    console.warn('[forge] migration legacy auth/config ignorée:', e);
  }
}

async function resolveSessionSecret(): Promise<string> {
  const env = process.env.FORGE_SESSION_SECRET?.trim();
  if (env) return env;
  const { db, Config } = await loadAstroDb();
  const rows = await db.select().from(Config).where(eq(Config.key, 'sessionSecret'));
  if (rows.length && rows[0].value) return rows[0].value;
  const secret = randomHex(32);
  await db.insert(Config).values({
    key: 'sessionSecret',
    value: secret,
    updatedAt: new Date(),
  });
  return secret;
}

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export async function hasUser(): Promise<boolean> {
  try {
    await migrateLegacyAuthOnce();
    const { db, ForgeUser } = await loadAstroDb();
    const rows = await db.select().from(ForgeUser).limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

export async function getUser(email: string) {
  const normalized = String(email || '').trim().toLowerCase();
  try {
    const { db, ForgeUser } = await loadAstroDb();
    const rows = await db.select().from(ForgeUser).where(eq(ForgeUser.email, normalized));
    return rows[0] ?? null;
  } catch {
    return null;
  }
}

export async function registerOrReplaceUser(email: string, password: string): Promise<void> {
  await migrateLegacyAuthOnce();
  const normalized = String(email || '').trim().toLowerCase();
  const salt = randomHex(16);
  const passwordHash = hashPassword(password, salt);
  const { db, ForgeUser } = await loadAstroDb();
  const now = new Date();
  const existing = await db.select().from(ForgeUser).where(eq(ForgeUser.email, normalized));
  if (existing.length) {
    await db.update(ForgeUser).set({ salt, passwordHash, updatedAt: now }).where(eq(ForgeUser.email, normalized));
  } else {
    await db.insert(ForgeUser).values({
      email: normalized,
      salt,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });
  }
}

/** Changement d’email et/ou mot de passe (compte déjà authentifié). */
export async function replaceAccountCredentials(
  oldEmail: string,
  newEmail: string,
  password: string,
): Promise<void> {
  await migrateLegacyAuthOnce();
  const o = String(oldEmail || '').trim().toLowerCase();
  const n = String(newEmail || '').trim().toLowerCase();
  const salt = randomHex(16);
  const passwordHash = hashPassword(password, salt);
  const { db, ForgeUser } = await loadAstroDb();
  const now = new Date();
  if (o !== n) {
    const taken = await db.select().from(ForgeUser).where(eq(ForgeUser.email, n));
    if (taken.length) {
      const err = new Error('Cet email est déjà utilisé');
      (err as Error & { code?: string }).code = 'EMAIL_TAKEN';
      throw err;
    }
    await db.delete(ForgeUser).where(eq(ForgeUser.email, o));
    await db.insert(ForgeUser).values({
      email: n,
      salt,
      passwordHash,
      createdAt: now,
      updatedAt: now,
    });
    return;
  }
  await db.update(ForgeUser).set({ salt, passwordHash, updatedAt: now }).where(eq(ForgeUser.email, o));
}

export async function verifyCredentials(email: string, password: string): Promise<boolean> {
  try {
    await migrateLegacyAuthOnce();
    const user = await getUser(email);
    if (!user?.passwordHash || !user?.salt) return false;
    const calculated = hashPassword(password, user.salt);
    return calculated === user.passwordHash;
  } catch {
    return false;
  }
}

export async function createSessionToken(email: string): Promise<string> {
  await migrateLegacyAuthOnce();
  const secret = await resolveSessionSecret();
  const exp = Date.now() + SESSION_DURATION_MS;
  const payloadObj = { email, exp };
  const payload = Buffer.from(JSON.stringify(payloadObj), 'utf-8').toString('base64url');
  const sig = signPayload(payload, secret);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(token: string): Promise<{ valid: boolean; email?: string }> {
  await migrateLegacyAuthOnce();
  if (!token || !token.includes('.')) {
    return { valid: false };
  }
  const [payload, sig] = token.split('.');
  const secret = await resolveSessionSecret();
  const expectedSig = signPayload(payload, secret);
  if (sig !== expectedSig) {
    return { valid: false };
  }
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (!data?.email || !data?.exp || Date.now() > Number(data.exp)) {
      return { valid: false };
    }
    return { valid: true, email: data.email };
  } catch {
    return { valid: false };
  }
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

export function isValidPassword(password: string): boolean {
  return String(password || '').length >= 10;
}

/** Messages explicites pour l’API login/register (éviter un 400 « identifiants invalides » sans détail). */
export function getCredentialsValidationError(
  email: string,
  password: string,
): string | null {
  const em = String(email || '').trim();
  const pw = String(password || '');
  if (!em) return 'Indiquez une adresse e-mail.';
  if (!isValidEmail(em)) return 'Format d’adresse e-mail invalide.';
  if (!pw) return 'Indiquez un mot de passe.';
  if (!isValidPassword(pw)) return 'Le mot de passe doit contenir au moins 10 caractères.';
  return null;
}

export function isValidAppName(name: string): boolean {
  return /^[a-zA-Z0-9._-]{2,64}$/.test(String(name || '').trim());
}
