import type { APIRoute } from 'astro';
import { asc } from 'drizzle-orm';
import { loadAstroDb } from '../../lib/load-astro-db';

const SEED_OPTIONS: Array<{
  category: string;
  kind: string;
  value: string;
  label: string;
  sortOrder: number;
}> = [
  { category: 'framework', kind: 'framework', value: 'astro_build', label: 'Astro build', sortOrder: 10 },
  { category: 'framework', kind: 'framework', value: 'nextjs', label: 'Next.js', sortOrder: 20 },
  { category: 'framework', kind: 'framework', value: 'nuxt', label: 'Nuxt', sortOrder: 30 },
  { category: 'framework', kind: 'framework', value: 'sveltekit', label: 'SvelteKit', sortOrder: 40 },
  { category: 'framework', kind: 'framework', value: 'custom', label: 'Custom', sortOrder: 999 },
  { category: 'framework', kind: 'component', value: 'preact', label: 'Preact', sortOrder: 10 },
  { category: 'framework', kind: 'component', value: 'react', label: 'React', sortOrder: 20 },
  { category: 'framework', kind: 'component', value: 'vue', label: 'Vue', sortOrder: 30 },
  { category: 'framework', kind: 'component', value: 'svelte', label: 'Svelte', sortOrder: 40 },
  { category: 'framework', kind: 'component', value: 'custom', label: 'Custom', sortOrder: 999 },
  { category: 'framework', kind: 'css', value: 'tailwindcss', label: 'Tailwind CSS', sortOrder: 10 },
  { category: 'framework', kind: 'css', value: 'css_modules', label: 'CSS Modules', sortOrder: 20 },
  { category: 'framework', kind: 'css', value: 'scss', label: 'SCSS', sortOrder: 30 },
  { category: 'framework', kind: 'css', value: 'custom', label: 'Custom', sortOrder: 999 },
  { category: 'framework', kind: 'ui_library', value: 'daisyui', label: 'DaisyUI', sortOrder: 10 },
  { category: 'framework', kind: 'ui_library', value: 'shadcn', label: 'shadcn/ui', sortOrder: 20 },
  { category: 'framework', kind: 'ui_library', value: 'mui', label: 'MUI', sortOrder: 30 },
  { category: 'framework', kind: 'ui_library', value: 'none', label: 'Aucune', sortOrder: 40 },
  { category: 'framework', kind: 'ui_library', value: 'custom', label: 'Custom', sortOrder: 999 },
  { category: 'language', kind: 'i18n', value: 'fr', label: 'Français', sortOrder: 10 },
  { category: 'language', kind: 'i18n', value: 'en', label: 'English', sortOrder: 20 },
  { category: 'language', kind: 'i18n', value: 'fr_en', label: 'Français + English', sortOrder: 30 },
  { category: 'language', kind: 'i18n', value: 'custom', label: 'Custom', sortOrder: 999 },
  { category: 'reporting', kind: 'reporting_language', value: 'fr', label: 'Français', sortOrder: 10 },
  { category: 'reporting', kind: 'reporting_language', value: 'en', label: 'English', sortOrder: 20 },
  { category: 'reporting', kind: 'reporting_language', value: 'fr_en', label: 'Français + English', sortOrder: 30 },
  { category: 'reporting', kind: 'reporting_language', value: 'custom', label: 'Custom', sortOrder: 999 },
  { category: 'quality', kind: 'quality', value: 'tests unitaires + integration obligatoires', label: 'Tests unitaires + intégration obligatoires', sortOrder: 10 },
  { category: 'quality', kind: 'quality', value: 'lint + build obligatoires avant merge', label: 'Lint + build obligatoires avant merge', sortOrder: 20 },
  { category: 'quality', kind: 'quality', value: 'tests e2e obligatoires', label: 'Tests E2E obligatoires', sortOrder: 30 },
  { category: 'quality', kind: 'quality', value: 'strict_mode_warn', label: 'Strict mode (warn)', sortOrder: 40 },
  { category: 'quality', kind: 'quality', value: 'strict_mode_enforce', label: 'Strict mode (enforce)', sortOrder: 50 },
  { category: 'quality', kind: 'quality', value: 'custom', label: 'Custom', sortOrder: 999 },
];

export const GET: APIRoute = async () => {
  try {
    const { db, AgentRuleOption } = await loadAstroDb();
    if (!AgentRuleOption) {
      return new Response(
        JSON.stringify({
          ok: true,
          source: 'seed-fallback',
          items: SEED_OPTIONS.map((o, i) => ({
            id: i + 1,
            category: o.category,
            kind: o.kind,
            value: o.value,
            label: o.label,
            enabled: 1,
            sortOrder: o.sortOrder,
            updatedAt: new Date(),
          })),
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
    let rows = await db.select().from(AgentRuleOption).orderBy(asc(AgentRuleOption.sortOrder));
    if (!rows.length) {
      await db.insert(AgentRuleOption).values(
        SEED_OPTIONS.map((o) => ({
          category: o.category,
          kind: o.kind,
          value: o.value,
          label: o.label,
          enabled: 1,
          sortOrder: o.sortOrder,
          updatedAt: new Date(),
        })),
      );
      rows = await db.select().from(AgentRuleOption).orderBy(asc(AgentRuleOption.sortOrder));
    }
    return new Response(JSON.stringify({ ok: true, items: rows }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e), items: [] }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }
};

