import { FORGE_AGENT_PROTOCOL_TITLE } from '../../lib/forge-agent-protocol';

/** Bloc repliable : consigne pour clôturer les missions carnet via l’API Forge. */
export default function ForgeAgentProtocolHint() {
  return (
    <details class="mb-4 rounded-[1.25rem] border border-gray-100 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm">
      <summary class="list-none flex cursor-pointer items-center gap-2 font-semibold text-[#175B37] [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true">📋</span>
        <span>{FORGE_AGENT_PROTOCOL_TITLE}</span>
      </summary>
      <div class="mt-4 space-y-3 border-t border-gray-100 pt-3 text-xs leading-relaxed">
        <p class="text-gray-600">
          Forge envoie les missions avec une ligne <strong class="text-gray-900">FORGE_DONE</strong> à produire en fin de réponse.
          Le serveur Forge interroge régulièrement ZimaOS, détecte cette ligne et met à jour la <strong class="text-gray-900">AgentTask</strong> + le carnet (demandes <code class="font-mono text-[#175B37]">[ForgeRequest #N]</code>) sans appel HTTP manuel.
          Les appels <code class="font-mono text-gray-500">PUT /api/agent-tasks</code> restent possibles mais ne sont plus obligatoires.
        </p>

        <div>
          <p class="mb-1 font-semibold text-gray-900">Commandes swarm standard</p>
          <ul class="list-disc space-y-1 pl-5 text-gray-600">
            <li><code class="font-mono text-[#175B37]">[FORGE_SWARM_COMMAND] start work</code> — démarrage selon rôle</li>
            <li><code class="font-mono text-[#175B37]">[FORGE_SWARM_COMMAND] pause work</code> — checkpoint + attente</li>
            <li><code class="font-mono text-[#175B37]">[FORGE_SWARM_COMMAND] resume work</code> — reprise depuis checkpoint</li>
            <li><code class="font-mono text-[#175B37]">[FORGE_SWARM_COMMAND] stop work</code> — arrêt propre + résumé final</li>
          </ul>
        </div>

        <div>
          <p class="mb-1 font-semibold text-gray-900">Option avancée — HTTP (facultatif)</p>
          <pre class="overflow-x-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-[11px] text-[#175B37]">{`PUT https://<hôte-forge>/api/agent-tasks
Content-Type: application/json

{
  "id": 42,
  "status": "completed",
  "output": "Résumé optionnel pour l’historique Forge"
}`}</pre>
          <p class="mt-2 text-gray-500">
            Utile si tu scripts hors ZimaOS. Sinon, priorité à la ligne <code class="font-mono text-[#175B37]">FORGE_DONE</code> détectée par Forge.
          </p>
        </div>

        <div>
          <p class="mb-1 font-semibold text-gray-900">Valeurs de status</p>
          <ul class="list-disc space-y-1 pl-5 text-gray-600">
            <li><code class="font-mono text-green-600">completed</code> — demande carnet → <strong class="text-gray-800">traitée</strong></li>
            <li><code class="font-mono text-amber-600">failed</code> — demande carnet → repasse en <strong class="text-gray-800">pending</strong> pour nouvelle tentative</li>
            <li><code class="font-mono text-red-600">cancelled</code> — demande carnet → <strong class="text-gray-800">rejetée</strong></li>
          </ul>
        </div>

        <p class="border-t border-gray-100 pt-3 text-gray-600">
          Côté humain, la chronologie des événements automatiques (dispatch, <span class="font-mono text-[#175B37]">FORGE_DONE</span>, sync carnet) est visible sur la page{' '}
          <a href="/agents/flux" class="text-[#175B37] underline decoration-[#175B37]/40 hover:text-[#134a2d]">Flux Swarm</a>.
        </p>

        <p class="text-gray-500">
          Pour rappel : ce endpoint est destiné aux appels serveur/agents depuis le LAN ; vérifie que la gateway Forge et le token sont corrects si tu appelles depuis un autre conteneur.
        </p>
      </div>
    </details>
  );
}
