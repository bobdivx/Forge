import { describe, expect, it } from 'vitest';

import { installToolPackage } from '../../src/lib/forge-tool-install';

describe('forge-tool-install', () => {
  it('rejette les noms de paquets non sûrs', async () => {
    const r = await installToolPackage({ pkg: '; rm -rf /' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/invalide/i);
  });

  it('rejette un nom vide', async () => {
    const r = await installToolPackage({ pkg: '' });
    expect(r.ok).toBe(false);
  });

  it('accepte un nom simple avec un manager explicite', async () => {
    // Note : on n'appelle pas réellement infra.exec ici car le test runtime
    // ne dispose pas d'astro:db / SSH. On vérifie juste le path de validation.
    const r = await installToolPackage({ pkg: 'ripgrep', manager: 'apt' });
    // L'exec va échouer en test (pas d'infra), mais le commande/manager
    // devraient être correctement résolus avant la tentative.
    expect(r.manager).toBe('apt');
    expect(r.command).toMatch(/ripgrep/);
  });
});
