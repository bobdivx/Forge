import { FORGE_AGENT_PROTOCOL_TITLE } from '../../lib/forge-agent-protocol';

/** Bloc repliable : consigne pour clôturer les missions carnet via l’API Forge. */
export default function ForgeAgentProtocolHint() {
  return (
    <details class="rounded-xl border border-emerald-900/70 bg-emerald-950/35 px-4 py-3 text-sm text-zinc-300 mb-4">
      <summary class="cursor-pointer font-semibold text-emerald-400 list-none [&::-webkit-details-marker]:hidden flex items-center gap-2">
        <span aria-hidden="true">📋</span>
        <span>{FORGE_AGENT_PROTOCOL_TITLE}</span>
      </summary>
      <div class="mt-4 space-y-3 text-xs leading-relaxed border-t border-emerald-900/50 pt-3">
        <p class="text-zinc-400">
          Forge envoie les missions avec une ligne <strong class="text-zinc-200">FORGE_DONE</strong> à produire en fin de réponse.
          Le serveur Forge interroge régulièrement OpenClaw, détecte cette ligne et met à jour la <strong class="text-zinc-200">AgentTask</strong> + le carnet (demandes <code class="font-mono text-emerald-300">[ForgeRequest #N]</code>) sans appel HTTP manuel.
          Les appels <code class="font-mono text-zinc-500">PUT /api/agent-tasks</code> restent possibles mais ne sont plus obligatoires.
        </p>

        <div>
          <p class="font-semibold text-zinc-200 mb-1">Option avancée — HTTP (facultatif)</p>
          <pre class="overflow-x-auto rounded-lg bg-zinc-950 border border-zinc-700 p-3 font-mono text-[11px] text-emerald-200 whitespace-pre-wrap">{`PUT https://<hôte-forge>/api/agent-tasks
Content-Type: application/json

{
  "id": 42,
  "status": "completed",
  "output": "Résumé optionnel pour l’historique Forge"
}`}</pre>
          <p class="mt-2 text-zinc-500">
            Utile si tu scripts hors OpenClaw. Sinon, priorité à la ligne <code class="font-mono text-emerald-300">FORGE_DONE</code> détectée par Forge.
          </p>
        </div>

        <div>
          <p class="font-semibold text-zinc-200 mb-1">Valeurs de status</p>
          <ul class="list-disc pl-5 space-y-1 text-zinc-400">
            <li><code class="font-mono text-green-400">completed</code> — demande carnet → <strong class="text-zinc-300">traitée</strong></li>
            <li><code class="font-mono text-amber-400">failed</code> — demande carnet → repasse en <strong class="text-zinc-300">pending</strong> pour nouvelle tentative</li>
            <li><code class="font-mono text-red-400">cancelled</code> — demande carnet → <strong class="text-zinc-300">rejetée</strong></li>
          </ul>
        </div>

        <p class="text-zinc-400 border-t border-zinc-800 pt-3">
          Côté humain, la chronologie des événements automatiques (dispatch, <span class="font-mono text-emerald-300">FORGE_DONE</span>, sync carnet) est visible sur la page{' '}
          <a href="/agents/flux" class="text-emerald-400 underline decoration-emerald-600/50 hover:text-emerald-300">Flux Swarm</a>.
        </p>

        <p class="text-zinc-500">
          Pour rappel : ce endpoint est destiné aux appels serveur/agents depuis le LAN ; vérifie que la gateway Forge et le token sont corrects si tu appelles depuis un autre conteneur.
        </p>
      </div>
    </details>
  );
}
