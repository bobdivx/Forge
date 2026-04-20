/**
 * Import dynamique de `astro:db` avec reprises courtes.
 *
 * En dev / au premier hit SSR, `import('astro:db')` peut s’exécuter avant que le plugin
 * `@astrojs/db` ait terminé l’enregistrement du seed handler → erreur interne
 * « INTERNAL Seed handler not loaded yet ». Les tentatives espacent ce chargement.
 *
 * Éviter les `import … from 'astro:db'` en tête des routes / middleware : préférer ce helper.
 */
const SEED_HANDLER_NOT_READY = /seed handler not loaded yet/i;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loadAstroDb() {
  const maxAttempts = 50;
  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await import('astro:db');
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      if (SEED_HANDLER_NOT_READY.test(msg) && attempt < maxAttempts) {
        await delay(Math.min(50 * attempt, 1000));
        continue;
      }
      throw e;
    }
  }

  throw lastErr;
}
