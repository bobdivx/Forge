/**
 * Paramètres Forge dans la table Config d’Astro DB (clé/valeur).
 * La clé interne `sessionSecret` n’est jamais exposée au client.
 */
import { eq } from 'drizzle-orm';
import { loadAstroDb } from './load-astro-db';

export type ForgeConfig = {
  /**
   * URL joignable **depuis les autres services** (ZimaOS Docker, cron, agents) pour appeler Forge.
   * Ex. `http://forge-host:4331` (Forge conteneur publié) ou `http://forge:4321` (même réseau Docker).
   * Laissé vide → fallback env / défaut localhost.
   */
  forgePublicUrl: string;
  /** Nom du conteneur Docker (Sandbox) où tournent les agents (ex: zimaos-runtime). */
  zimaosContainerName: string;
  /** URL du service Gateway sur l'hôte ZimaOS. */
  zimaosGatewayUrl: string;
  zimaosToken: string;
  /** Alias métier ZimaOS du runtime gateway (remplace zimaosGatewayUrl côté UI). */
  zimaosRuntimeUrl: string;
  /** local_docker (même hôte Docker) | remote_ssh (machine distante). */
  zimaosAccessMode: string;
  /** Hôte/NAS ZimaOS distant si mode remote_ssh. */
  zimaosHost: string;
  /** Port SSH ZimaOS distant. */
  zimaosSshPort: string;
  /** Utilisateur SSH ZimaOS distant. */
  zimaosSshUser: string;
  /** Auth SSH: key | password (mot de passe non stocké ici). */
  zimaosSshAuth: string;
  /** Chemin clé privée lisible par le conteneur Ageton. */
  zimaosSshKeyPath: string;
  /** Contenu de la clé privée (si stockée en DB). */
  zimaosSshKeyContent: string;
  /** Mot de passe SSH (si auth === password). */
  zimaosSshPassword: string;
  /** Jeton machine-to-machine pour les appels agents -> API Forge. */
  forgeApiToken: string;
  /** URL de l’API Ollama (GET /api/tags), ex. http://host.docker.internal:11434 — même rôle que OLLAMA_HOST. */
  ollamaUrl: string;
  githubToken: string;
  vercelToken: string;
  cloudflareToken: string;
  /** Secret HMAC du webhook GitHub (PR Jules) — même valeur que dans les réglages du dépôt GitHub. */
  githubWebhookSecret: string;
  forgeReposRoot: string;
  dockerYamlDir: string;
  dockerAppDataDir: string;
  /** Racine des projets telle que vue par les agents sur le NAS (ex: /mnt/GitHub). */
  forgeReposRootAgent: string;
  /**
   * Assistant premier lancement : `pending` → redirection /setup.
   * `done` / `skipped` → plus d’assistant. Défaut `done` si absent en base (installations existantes).
   */
  forgeSetupState: string;
  /** Active la routine Forge de surveillance/amélioration (true|false). */
  routineEnabled: string;
  /** Intervalle en minutes entre deux passes routine. */
  routineIntervalMinutes: string;
  /** Répertoire GitHub à surveiller côté utilisateur (chemin hôte, non hardcodé). */
  routineGithubRoot: string;
  /** Agent dédié à la surveillance GitHub. */
  routineWatchAgentId: string;
  /** Agent dédié aux propositions d'amélioration (vTech). */
  routineImproveAgentId: string;
  /** Règles globales appliquées aux réponses agents et à l'orchestrateur Forge. */
  agentGlobalBuildRules: string;
  /** Langue préférée pour chat, rapports et demandes agents (fr | en | fr_en). */
  agentPreferredLanguage: string;
  /** Règles structurées agents (JSON string). */
  agentPolicyRules: string;
  /** Modèle LLM par défaut pour l'équipe (ex: qwen2.5:7b, Auto). */
  agentDefaultModel: string;
  /**
   * `true` : en mode planifié, le dispatch des tâches carnet / bugs (file) continue hors plage horaire.
   * `false` : hors plage, rien n'est envoyé aux agents (sauf démarrage manuel « Démarrer maintenant »).
   */
  workSchedulerDispatchOutsideWindow: string;
};

/** Valeurs neutres si aucune ligne Config en base (pas de chemins ou URLs « maison » codés en dur). */
export const CONFIG_DEFAULTS: ForgeConfig = {
  forgePublicUrl: '',
  zimaosContainerName: '',
  zimaosGatewayUrl: '',
  zimaosToken: '',
  zimaosRuntimeUrl: '',
  zimaosAccessMode: 'local_docker',
  zimaosHost: '',
  zimaosSshPort: '22',
  zimaosSshUser: '',
  zimaosSshAuth: 'key',
  zimaosSshKeyPath: '',
  zimaosSshKeyContent: '',
  zimaosSshPassword: '',
  forgeApiToken: '',
  ollamaUrl: '',
  githubToken: '',
  vercelToken: '',
  cloudflareToken: '',
  githubWebhookSecret: '',
  forgeReposRoot: '',
  dockerYamlDir: '',
  dockerAppDataDir: '',
  forgeReposRootAgent: '',
  forgeSetupState: 'done',
  routineEnabled: 'false',
  routineIntervalMinutes: '60',
  routineGithubRoot: '',
  routineWatchAgentId: 'MAINTENANCE_REPO',
  routineImproveAgentId: 'VEILLE_TECH',
  agentGlobalBuildRules:
    'Toujours produire les applications en francais et anglais (i18n fr/en).\\n' +
    'Stack imposee: Astro build, composants Preact, Tailwind CSS, DaisyUI.\\n' +
    'Respecter l architecture existante et eviter les regressions.',
  agentPreferredLanguage: 'fr',
  agentPolicyRules: '[]',
  agentDefaultModel: 'Auto',
  workSchedulerDispatchOutsideWindow: 'true',
};

const INTERNAL_CONFIG_KEYS = new Set(['sessionSecret']);

/**
 * Origine HTTP pour l’API Ollama (`GET …/api/tags`).
 * Ordre : Paramètres (`ollamaUrl`) → instance Ollama activée → `OLLAMA_HOST` → `OLLAMA_ORIGIN` → localhost en dev.
 */
export async function getOllamaOriginResolved(): Promise<string> {
  const normalizeOrigin = (raw: string): string => {
    const value = String(raw || '').trim();
    if (!value) return '';
    const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`;
    try {
      const url = new URL(withProtocol);
      if (url.hostname === '0.0.0.0') url.hostname = '127.0.0.1';
      return `${url.protocol}//${url.host}`;
    } catch {
      return withProtocol.replace(/\/+$/, '');
    }
  };
  const fromDb = (await getConfig('ollamaUrl')).trim();
  if (fromDb) return normalizeOrigin(fromDb);

  let fromInstance = '';
  try {
    const { db, OllamaInstance } = await loadAstroDb();
    if (OllamaInstance) {
      const rows = await db.select().from(OllamaInstance).where(eq(OllamaInstance.enabled, 1)).limit(1);
      fromInstance = String(rows[0]?.url || '').trim();
    }
  } catch {
    fromInstance = '';
  }
  if (fromInstance) return normalizeOrigin(fromInstance);

  return normalizeOrigin(
    process.env.OLLAMA_HOST?.trim() ||
    process.env.OLLAMA_ORIGIN?.trim() ||
    (process.env.NODE_ENV !== 'production' ? 'http://127.0.0.1:11434' : ''),
  );
}

export async function getConfig(key: keyof ForgeConfig, _legacyAllowEmpty?: boolean): Promise<string> {
  try {
    const { db, Config } = await loadAstroDb();
    const rows = await db.select().from(Config).where(eq(Config.key, key));
    if (rows.length && rows[0].value !== '') return rows[0].value;
  } catch {
    /* DB indisponible */
  }
  return CONFIG_DEFAULTS[key];
}

/** Toutes les clés « métier » (pas les clés internes comme sessionSecret). */
export async function getAllConfig(): Promise<ForgeConfig> {
  const result = { ...CONFIG_DEFAULTS };
  try {
    const { db, Config } = await loadAstroDb();
    const rows = await db.select().from(Config);
    for (const row of rows) {
      if (INTERNAL_CONFIG_KEYS.has(row.key)) continue;
      if (row.key in result && row.value !== '') {
        (result as Record<string, string>)[row.key] = row.value;
      }
    }
  } catch {
    /* DB indisponible */
  }
  return result;
}

export async function setConfig(partial: Partial<ForgeConfig>): Promise<void> {
  for (const [key, value] of Object.entries(partial)) {
    if (!(key in CONFIG_DEFAULTS)) continue;
    if (INTERNAL_CONFIG_KEYS.has(key)) continue;
    const val = String(value ?? '');
    try {
      const { db, Config } = await loadAstroDb();
      const existing = await db.select().from(Config).where(eq(Config.key, key));
      if (existing.length) {
        await db.update(Config).set({ value: val, updatedAt: new Date() }).where(eq(Config.key, key));
      } else {
        await db.insert(Config).values({ key, value: val, updatedAt: new Date() });
      }
    } catch (e) {
      console.error(`setConfig(${key}) failed:`, e);
    }
  }
}
