import { useEffect, useMemo, useState } from 'preact/hooks';

type Rule = {
  id: string;
  scope: 'global' | 'project';
  projectId: number | null;
  category: 'framework' | 'ui' | 'language' | 'reporting' | 'quality' | 'custom';
  name: string;
  rule: string;
  field: string;
  operator: 'is' | 'contains' | 'in';
  value: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

type Project = { id: number; name: string };

const CATEGORIES = ['framework', 'ui', 'language', 'reporting', 'quality', 'custom'] as const;
const CATEGORY_HINTS: Record<(typeof CATEGORIES)[number], string> = {
  framework: 'Ex: astro_build, nextjs, nuxt, laravel',
  ui: 'Ex: preact + tailwind + daisyui',
  language: 'Ex: app_i18n=fr_en',
  reporting: 'Ex: preferred_language=fr',
  quality: 'Ex: tests_required=true',
  custom: 'Règle libre spécifique à ton équipe',
};
const CATEGORY_ICONS: Record<(typeof CATEGORIES)[number], string> = {
  framework: '🧱',
  ui: '🎨',
  language: '🌍',
  reporting: '🗣️',
  quality: '✅',
  custom: '⚙️',
};

const QUICK_RULES: Array<{
  label: string;
  category: (typeof CATEGORIES)[number];
  kind: string;
  name: string;
  rule: string;
}> = [
  {
    label: 'Framework Astro build',
    category: 'framework',
    kind: 'framework',
    name: 'Framework principal',
    rule: 'astro_build',
  },
  {
    label: 'Composant Preact',
    category: 'framework',
    kind: 'component',
    name: 'Moteur de composants',
    rule: 'preact',
  },
  {
    label: 'UI DaisyUI',
    category: 'framework',
    kind: 'ui_library',
    name: 'Bibliothèque UI',
    rule: 'daisyui',
  },
  {
    label: 'Langues FR + EN',
    category: 'language',
    kind: 'i18n',
    name: 'Internationalisation',
    rule: 'fr_en',
  },
  {
    label: 'Rapports en français',
    category: 'reporting',
    kind: 'reporting_language',
    name: 'Langue des rapports agents',
    rule: 'fr',
  },
  {
    label: 'Qualité minimale',
    category: 'quality',
    kind: 'quality',
    name: 'Tests avant livraison',
    rule: 'tests unitaires et integration obligatoires avant merge',
  },
];

const SELECT_CLASS =
  'rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#175B37]';

type RuleOptionItem = {
  id: number;
  category: string;
  kind: string;
  value: string;
  label: string;
  enabled: number;
  sortOrder: number;
};

const emptyDraft = (): Rule => ({
  id: '',
  scope: 'global',
  projectId: null,
  category: 'framework',
  name: '',
  rule: '',
  field: '',
  operator: 'is',
  value: '',
  enabled: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export default function AgentRulesTab() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'global' | 'project'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | Rule['category']>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Rule>(emptyDraft());
  const [ruleOptions, setRuleOptions] = useState<RuleOptionItem[]>([]);
  const [selectedKind, setSelectedKind] = useState('');
  const [selectedOptionValue, setSelectedOptionValue] = useState('');
  const [undoInfo, setUndoInfo] = useState<{ ruleId: string; expiresAt: number } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [data, opt] = await Promise.all([
        fetch('/api/agent-rules').then((r) => r.json()),
        fetch('/api/agent-rule-options').then((r) => r.json()),
      ]);
      setRules(Array.isArray(data.rules) ? data.rules : []);
      setProjects(Array.isArray(data.projects) ? data.projects.map((p: any) => ({ id: p.id, name: p.name })) : []);
      const optItems = Array.isArray(opt.items) ? opt.items : [];
      setRuleOptions(optItems);
    } finally {
      setLoading(false);
    }
  };

  const optionsByKind = (kind: string) =>
    ruleOptions.filter((o) => o.kind === kind && Number(o.enabled) === 1).sort((a, b) => a.sortOrder - b.sortOrder);
  const kindsForCategory = (category: string) =>
    [...new Set(ruleOptions.filter((o) => o.category === category && Number(o.enabled) === 1).map((o) => o.kind))];

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const kinds = kindsForCategory(draft.category);
    if (!kinds.length) {
      setSelectedKind('');
      setSelectedOptionValue('');
      return;
    }
    if (!selectedKind || !kinds.includes(selectedKind)) {
      const firstKind = kinds[0];
      setSelectedKind(firstKind);
      const firstOption = optionsByKind(firstKind)[0];
      setSelectedOptionValue(firstOption?.value || '');
    }
  }, [draft.category, ruleOptions]);

  const filtered = useMemo(
    () =>
      rules.filter(
        (r) =>
          (scopeFilter === 'all' || r.scope === scopeFilter) &&
          (categoryFilter === 'all' || r.category === categoryFilter),
      ),
    [rules, scopeFilter, categoryFilter],
  );

  const openCreate = () => {
    setEditingId(null);
    setDraft({ ...emptyDraft(), id: crypto.randomUUID?.() || `rule-${Date.now()}` });
    setSelectedKind('');
    setSelectedOptionValue('');
    setModalOpen(true);
  };

  const openEdit = (rule: Rule) => {
    setEditingId(rule.id);
    setDraft({ ...rule });
    setSelectedKind('');
    setSelectedOptionValue(rule.rule || rule.value || '');
    setModalOpen(true);
  };

  const removeRule = (id: string) => {
    if (!confirm('Supprimer cette règle ?')) return;
    const nextRules = rules.filter((r) => r.id !== id);
    void persistRules(nextRules, 'Règle supprimée.');
  };

  const persistRules = async (nextRules: Rule[], successMessage: string) => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/agent-rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rules: nextRules }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        setRules(nextRules);
        setMessage(successMessage);
      } else {
        setMessage('Erreur de sauvegarde.');
      }
    } finally {
      setSaving(false);
    }
  };

  const createInstantRule = (value: string) => {
    const selected = String(value || '').trim();
    if (!selected || draft.category === 'custom') return;
    const now = new Date().toISOString();
    const next = {
      ...draft,
      id: draft.id || crypto.randomUUID?.() || `rule-${Date.now()}`,
      name: `${draft.category} · ${selectedKind || 'option'} · ${selected}`,
      rule: selected,
      field: draft.category.trim(),
      operator: 'is' as const,
      value: selected,
      updatedAt: now,
      createdAt: draft.createdAt || now,
    };
    const nextRules = [next, ...rules];
    void persistRules(nextRules, 'Règle ajoutée automatiquement.');
    setUndoInfo({ ruleId: next.id, expiresAt: Date.now() + 5000 });
    setTimeout(() => {
      setUndoInfo((curr) => (curr?.ruleId === next.id ? null : curr));
    }, 5000);
    setModalOpen(false);
  };

  const undoLastAutoAdd = () => {
    if (!undoInfo) return;
    const nextRules = rules.filter((r) => r.id !== undoInfo.ruleId);
    setUndoInfo(null);
    void persistRules(nextRules, 'Ajout annulé.');
  };

  const upsertRule = () => {
    const isCustom = draft.category === 'custom';
    const computedRule = isCustom ? draft.rule.trim() : selectedOptionValue.trim();
    const computedName = isCustom
      ? draft.name.trim()
      : `${draft.category} · ${selectedKind || 'option'} · ${computedRule || 'valeur'}`;
    if (!computedRule) {
      setMessage(isCustom ? 'Nom et règle sont requis.' : 'Sélectionne une valeur de règle.');
      return;
    }
    if (isCustom && !computedName) {
      setMessage('Nom et règle sont requis.');
      return;
    }
    const now = new Date().toISOString();
    const next = {
      ...draft,
      name: computedName,
      rule: computedRule,
      // Compat moteur actuel
      field: draft.category.trim(),
      operator: 'is' as const,
      value: computedRule,
      updatedAt: now,
      createdAt: draft.createdAt || now,
    };
    const idx = rules.findIndex((r) => r.id === next.id);
    const nextRules = idx < 0 ? [next, ...rules] : rules.map((r, i) => (i === idx ? next : r));
    void persistRules(nextRules, editingId ? 'Règle modifiée.' : 'Règle ajoutée.');
    setModalOpen(false);
  };

  const applyQuickRule = (preset: (typeof QUICK_RULES)[number]) => {
    setDraft((d) => ({
      ...d,
      category: preset.category,
      name: preset.name,
      rule: preset.rule,
    }));
    setSelectedKind(preset.kind);
    setSelectedOptionValue(preset.rule);
  };

  const applyStructuredRule = () => {
    if (!selectedOptionValue) return;
    setDraft((d) => ({
      ...d,
      rule: selectedOptionValue,
      name: d.name.trim() ? d.name : `${d.category} · ${selectedKind || 'regle'}`,
    }));
  };

  const saveAll = async () => {
    await persistRules(rules, 'Règles sauvegardées.');
  };

  return (
    <div class="p-6 space-y-5">
      <div class="flex items-center justify-between">
        <div>
          <h2 class="text-lg font-bold text-gray-900">Règles agents</h2>
          <p class="text-xs text-gray-500">Gestion moderne des règles globales et par application (framework, langues, UI, etc.).</p>
        </div>
        <div class="flex gap-2">
          <button onClick={openCreate} class="rounded-full bg-[#175B37] px-4 py-2 text-xs font-bold text-white">Ajouter une règle</button>
          <button onClick={saveAll} disabled={saving} class="rounded-full border border-gray-300 bg-white px-4 py-2 text-xs font-bold text-gray-700">
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <select value={scopeFilter} onChange={(e) => setScopeFilter((e.target as HTMLSelectElement).value as any)} class={SELECT_CLASS}>
          <option value="all">Toutes les portées</option>
          <option value="global">Globales</option>
          <option value="project">Par application</option>
        </select>
        <select value={categoryFilter} onChange={(e) => setCategoryFilter((e.target as HTMLSelectElement).value as any)} class={SELECT_CLASS}>
          <option value="all">Toutes les catégories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div class="rounded-xl border border-gray-200 bg-white p-3">
        <p class="text-xs font-semibold text-gray-700 mb-2">Ajout rapide</p>
        <div class="flex flex-wrap gap-2">
          {QUICK_RULES.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                openCreate();
                setTimeout(() => applyQuickRule(preset), 0);
              }}
              class="rounded-full border border-gray-300 bg-gray-50 px-3 py-1 text-xs text-gray-700 hover:bg-gray-100"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p class="text-xs text-gray-500">Chargement...</p>
      ) : (
        <div class="space-y-2">
          {filtered.map((r) => (
            <div key={r.id} class="rounded-xl border border-gray-200 bg-white p-3">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 text-xs text-gray-700">
                  <span class="text-sm" aria-hidden="true">{CATEGORY_ICONS[r.category] || '⚙️'}</span>
                  <span class="font-semibold">{r.name || r.category}</span>
                  <span
                    class={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      r.scope === 'global'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-violet-50 text-violet-700 border border-violet-200'
                    }`}
                  >
                    {r.scope === 'global'
                      ? 'globale'
                      : `app: ${projects.find((p) => p.id === r.projectId)?.name || r.projectId || '?'}`}
                  </span>
                </div>
                <div class="flex gap-2">
                  <button onClick={() => openEdit(r)} class="text-xs text-[#175B37]">Modifier</button>
                  <button onClick={() => removeRule(r.id)} class="text-xs text-red-600">Supprimer</button>
                </div>
              </div>
              <div class="mt-2 flex items-center gap-2 text-sm text-gray-900">
                <span class="rounded bg-gray-100 px-2 py-0.5 text-xs font-mono text-gray-700">
                  {r.field || r.category}
                </span>
                <span class="text-gray-400">:</span>
                <span class="font-medium">{r.rule || r.value}</span>
              </div>
            </div>
          ))}
          {!filtered.length ? <p class="text-xs text-gray-500">Aucune règle.</p> : null}
        </div>
      )}

      {message ? <div class="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">{message}</div> : null}
      {undoInfo && Date.now() < undoInfo.expiresAt ? (
        <div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 flex items-center justify-between">
          <span>Règle ajoutée. Tu peux annuler pendant 5 secondes.</span>
          <button
            type="button"
            onClick={undoLastAutoAdd}
            class="rounded-full border border-amber-300 bg-white px-3 py-1 text-[11px] font-semibold text-amber-700"
          >
            Annuler
          </button>
        </div>
      ) : null}
      {modalOpen ? (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div class="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl space-y-4">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-bold text-gray-900">{editingId ? 'Modifier une règle' : 'Ajouter une règle'}</h3>
              <button onClick={() => setModalOpen(false)} class="text-xs text-gray-500">Fermer</button>
            </div>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <select value={draft.scope} onChange={(e) => setDraft((d) => ({ ...d, scope: (e.target as HTMLSelectElement).value as any, projectId: null }))} class={SELECT_CLASS}>
                <option value="global">Globale</option>
                <option value="project">Par application</option>
              </select>
              <select value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: (e.target as HTMLSelectElement).value as any }))} class={SELECT_CLASS}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {draft.category !== 'custom' ? (
                <select
                  value={selectedKind}
                  onChange={(e) => {
                    const nextKind = (e.target as HTMLSelectElement).value;
                    setSelectedKind(nextKind);
                    const first = optionsByKind(nextKind)[0];
                    setSelectedOptionValue(first?.value || '');
                  }}
                  class={SELECT_CLASS}
                >
                  <option value="">Type de règle</option>
                  {kindsForCategory(draft.category).map((k) => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
              ) : null}
              {draft.scope === 'project' ? (
                <select value={draft.projectId ?? ''} onChange={(e) => setDraft((d) => ({ ...d, projectId: Number((e.target as HTMLSelectElement).value) || null }))} class={`${SELECT_CLASS} md:col-span-2`}>
                  <option value="">Sélectionner une application</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              ) : null}
              {draft.category === 'custom' ? (
                <input value={draft.name} onInput={(e) => setDraft((d) => ({ ...d, name: (e.target as HTMLInputElement).value }))} placeholder="Nom de la règle (ex: Stack Front standard)" class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm md:col-span-2" />
              ) : null}
              {draft.category !== 'custom' && selectedKind ? (
                <>
                  <select
                    value={selectedOptionValue}
                    onChange={(e) => {
                      const val = (e.target as HTMLSelectElement).value;
                      setSelectedOptionValue(val);
                      if (!editingId) createInstantRule(val);
                    }}
                    class={`${SELECT_CLASS} md:col-span-2`}
                  >
                    <option value="">Valeur</option>
                    {optionsByKind(selectedKind).map((v) => <option key={v.id} value={v.value}>{v.label}</option>)}
                  </select>
                  <p class="text-[11px] text-gray-500 md:col-span-2">
                    {editingId
                      ? 'Mode édition: sélectionne une valeur puis clique sur Mettre à jour.'
                      : 'Mode rapide: la règle est ajoutée automatiquement dès sélection de la valeur.'}
                  </p>
                </>
              ) : null}
              {draft.category === 'custom' ? (
                <textarea
                  value={draft.rule}
                  onInput={(e) => setDraft((d) => ({ ...d, rule: (e.target as HTMLTextAreaElement).value }))}
                  placeholder={`Règle en question — ${CATEGORY_HINTS[draft.category]}`}
                  rows={4}
                  class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm md:col-span-2"
                />
              ) : (
                <div class="md:col-span-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
                  Valeur sélectionnée: <span class="font-semibold">{selectedOptionValue || '—'}</span>
                </div>
              )}
              <p class="text-[11px] text-gray-500 md:col-span-2">
                Conseil: écris une règle vérifiable et sans ambiguïté (ex: "UI en fr_en", "framework astro_build", "preact obligatoire").
              </p>
            </div>
            <div class="flex justify-end gap-2">
              <button onClick={() => setModalOpen(false)} class="rounded-full border border-gray-300 bg-white px-4 py-2 text-xs font-bold text-gray-700">Annuler</button>
              <button onClick={upsertRule} class="rounded-full bg-[#175B37] px-4 py-2 text-xs font-bold text-white">{editingId ? 'Mettre à jour' : 'Ajouter'}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

