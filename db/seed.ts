/**
 * Import dynamique obligatoire : un `import { … } from 'astro:db'` en tête de ce fichier
 * s’exécute pendant le bootstrap de `@astrojs/db` avant l’enregistrement du seed handler,
 * ce qui provoque « INTERNAL Seed handler not loaded yet ».
 *
 * Aucun projet, agent ni message fictif : les apps viennent de la synchro (/api/sync-projects),
 * les agents et modèles des actions utilisateur ou imports explicites.
 */
export default async function seed() {
  const { db, Config } = await import('astro:db');

  // ── 1. Config initiale (clés vides ou neutres — pas de chemins « maison » imposés) ──
  try {
    const existingConfig = await db.select().from(Config);
    if (existingConfig.length === 0) {
      await db.insert(Config).values([
        { key: 'openclawGatewayUrl', value: '', updatedAt: new Date() },
        { key: 'openclawToken', value: '', updatedAt: new Date() },
        { key: 'ollamaUrl', value: '', updatedAt: new Date() },
        { key: 'githubToken', value: '', updatedAt: new Date() },
        { key: 'vercelToken', value: '', updatedAt: new Date() },
        { key: 'githubWebhookSecret', value: '', updatedAt: new Date() },
        { key: 'forgeReposRoot', value: '', updatedAt: new Date() },
        { key: 'dockerYamlDir', value: '', updatedAt: new Date() },
        { key: 'dockerAppDataDir', value: '', updatedAt: new Date() },
        { key: 'forgeSetupState', value: 'pending', updatedAt: new Date() },
      ]);
      console.log('Config keys seeded (empty — utilisateur à renseigner).');
    }
  } catch (e) {
    console.warn('Config seed skipped:', e);
  }
}
