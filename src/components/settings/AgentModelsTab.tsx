import AgentModelMatrix from './AgentModelMatrix';

export default function AgentModelsTab() {
  return (
    <div class="p-6 space-y-6">
      <div class="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-lg font-bold text-gray-900 mb-1">Modèles agents</h2>
          <p class="text-xs text-gray-500 max-w-2xl">
            Gestion centralisée de l’équipe d’agents. Chaque carte reflète le modèle LLM configuré dans Forge et vérifié côté Ollama.
          </p>
        </div>
        <a
          href="/agents/instructions"
          class="text-xs border border-gray-200 bg-white rounded-full px-3 py-1.5 text-gray-600 hover:bg-gray-50 transition-colors flex items-center gap-1.5 shrink-0"
        >
          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
          </svg>
          Instructions agents
        </a>
      </div>
      <AgentModelMatrix />
    </div>
  );
}
