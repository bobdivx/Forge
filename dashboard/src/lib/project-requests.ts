// @ts-nocheck
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { forgeRequestsFile } from './forge-repos';

export type ForgeRequestStatus = 'En attente' | 'En cours' | 'Traite';
export type ForgeRequestType = 'Fonctionnalite' | 'Correction';

export type ForgeRequestItem = {
  id: string;
  type: ForgeRequestType;
  title: string;
  status: ForgeRequestStatus;
  agent: string;
  updatedAt: string;
  detail?: string;
};

type Store = { items: ForgeRequestItem[] };

function emptyStore(): Store {
  return { items: [] };
}

export function readForgeRequests(projectPath: string): ForgeRequestItem[] {
  const file = forgeRequestsFile(projectPath);
  try {
    if (!fs.existsSync(file)) return [];
    const raw = fs.readFileSync(file, 'utf-8');
    const data = JSON.parse(raw) as Store;
    if (!data || !Array.isArray(data.items)) return [];
    return data.items.filter(
      (x) => x && typeof x.id === 'string' && typeof x.title === 'string'
    );
  } catch {
    return [];
  }
}

export function appendForgeRequest(
  projectPath: string,
  payload: { type: ForgeRequestType; title: string; detail?: string }
): ForgeRequestItem | null {
  const title = String(payload.title || '').trim();
  if (title.length < 2 || title.length > 500) return null;

  const type: ForgeRequestType =
    payload.type === 'Correction' ? 'Correction' : 'Fonctionnalite';

  const dir = path.join(projectPath, '.forge');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const file = forgeRequestsFile(projectPath);
  let store: Store = emptyStore();
  if (fs.existsSync(file)) {
    try {
      store = { ...emptyStore(), ...JSON.parse(fs.readFileSync(file, 'utf-8')) };
      if (!Array.isArray(store.items)) store.items = [];
    } catch {
      store = emptyStore();
    }
  }

  const item: ForgeRequestItem = {
    id: `req_${crypto.randomBytes(6).toString('hex')}`,
    type,
    title,
    status: 'En attente',
    agent: '—',
    updatedAt: new Date().toISOString(),
    detail: payload.detail ? String(payload.detail).slice(0, 2000) : undefined,
  };

  store.items.unshift(item);
  store.items = store.items.slice(0, 200);

  fs.writeFileSync(file, JSON.stringify(store, null, 2), 'utf-8');
  return item;
}
