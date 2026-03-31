// @ts-nocheck
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const AUTH_PATH = '/media/Github/Forge/instructions/auth.json';
const SETTINGS_PATH = '/media/Github/Forge/instructions/config.json';
const SESSION_DURATION_MS = 1000 * 60 * 60 * 12; // 12h

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function randomHex(size = 32): string {
  return crypto.randomBytes(size).toString('hex');
}

function readJson(filePath: string): any {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    return {};
  }
}

function writeJson(filePath: string, data: any) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

function getAuthStore() {
  const store = readJson(AUTH_PATH);
  if (!store.sessionSecret) {
    store.sessionSecret = randomHex(32);
    writeJson(AUTH_PATH, store);
  }
  return store;
}

function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

export function hasUser(): boolean {
  const store = getAuthStore();
  return Boolean(store.user?.email && store.user?.passwordHash && store.user?.salt);
}

export function registerOrReplaceUser(email: string, password: string) {
  const normalized = String(email || '').trim().toLowerCase();
  const salt = randomHex(16);
  const passwordHash = hashPassword(password, salt);
  const store = getAuthStore();
  store.user = {
    email: normalized,
    salt,
    passwordHash,
    updatedAt: new Date().toISOString()
  };
  writeJson(AUTH_PATH, store);
}

export function verifyCredentials(email: string, password: string): boolean {
  const store = getAuthStore();
  const user = store.user;
  if (!user?.email || !user?.passwordHash || !user?.salt) {
    return false;
  }
  const normalized = String(email || '').trim().toLowerCase();
  if (normalized !== user.email) {
    return false;
  }
  const calculated = hashPassword(password, user.salt);
  const a = Buffer.from(calculated, 'hex');
  const b = Buffer.from(user.passwordHash, 'hex');
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
}

function signPayload(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createSessionToken(email: string): string {
  const store = getAuthStore();
  const exp = Date.now() + SESSION_DURATION_MS;
  const payloadObj = { email, exp };
  const payload = Buffer.from(JSON.stringify(payloadObj), 'utf-8').toString('base64url');
  const sig = signPayload(payload, store.sessionSecret);
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): { valid: boolean; email?: string } {
  if (!token || !token.includes('.')) {
    return { valid: false };
  }
  const [payload, sig] = token.split('.');
  const store = getAuthStore();
  const expectedSig = signPayload(payload, store.sessionSecret);
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

export function readAppSettings() {
  return readJson(SETTINGS_PATH);
}

export function writeAppSettings(data: any) {
  writeJson(SETTINGS_PATH, data);
}

export function getOpenClawToken(): string {
  const settings = readAppSettings();
  return String(settings?.openclawToken || '');
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

export function isValidPassword(password: string): boolean {
  return String(password || '').length >= 10;
}

export function isValidAppName(name: string): boolean {
  return /^[a-zA-Z0-9._-]{2,64}$/.test(String(name || '').trim());
}
