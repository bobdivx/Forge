import type { GatewayRemediation } from './types';

interface Props {
  remediation: GatewayRemediation;
  copyToClipboard: (text: string) => Promise<void>;
}

export default function RemediationGuide({ remediation, copyToClipboard }: Props) {
  return (
    <div class="mt-3 space-y-3">
      {remediation.bashScript && (
        <details class="rounded-lg border border-gray-100 bg-white/90 p-2 shadow-sm">
          <summary class="cursor-pointer text-xs font-semibold text-gray-700">Script d'automatisation (Bash/SSH)</summary>
          <div class="mt-2">
            <button
              type="button"
              class="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium transition hover:bg-gray-50"
              onClick={() => void copyToClipboard(remediation.bashScript || '')}
            >
              Copier le script
            </button>
          </div>
          <pre class="mt-2 max-h-40 overflow-auto rounded bg-gray-900 p-2 text-[10px] text-emerald-400">
            {remediation.bashScript}
          </pre>
        </details>
      )}
      {remediation.zimaosPrompt && (
        <details class="rounded-lg border border-gray-100 bg-white/90 p-2 shadow-sm">
          <summary class="cursor-pointer text-xs font-semibold text-gray-700">Instruction ZimaOS</summary>
          <div class="mt-2">
            <button
              type="button"
              class="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium transition hover:bg-gray-50"
              onClick={() => void copyToClipboard(remediation.zimaosPrompt || '')}
            >
              Copier l'instruction
            </button>
          </div>
          <pre class="mt-2 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 text-[11px] italic text-gray-600">
            {remediation.zimaosPrompt}
          </pre>
        </details>
      )}
    </div>
  );
}
