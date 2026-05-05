import type { ChatMessage, RoutingDebugState } from './types';
import type { AgentTeamProfile } from '../../../lib/agent-profile';
import TeamAvatar from '../../agents/TeamAvatar';
import RemediationGuide from './RemediationGuide';
import Markdown from '../../ui/Markdown';
import { useState } from 'preact/hooks';

interface Props {
  chat: ChatMessage[];
  historyLoading: boolean;
  agentId: string;
  selectedTeamProfile?: AgentTeamProfile;
  sending: boolean;
  pollingReply: boolean;
  routingDebug: RoutingDebugState | null;
  chatEndRef: preact.RefObject<HTMLDivElement>;
  copyToClipboard: (text: string) => Promise<void>;
  currentSteps?: any[];
}

type StepItem = NonNullable<ChatMessage['steps']>[number] & {
  id?: number;
  createdAt?: string;
};

type ParsedPayload = Record<string, unknown> | null;

function parseStepPayload(payload: unknown): ParsedPayload {
  if (!payload || payload === 'ok' || payload === 'running') return null;
  if (typeof payload === 'object') return payload as ParsedPayload;
  if (typeof payload !== 'string') return null;
  try {
    const parsed = JSON.parse(payload);
    return parsed && typeof parsed === 'object' ? parsed as ParsedPayload : null;
  } catch {
    return null;
  }
}

function payloadText(payload: unknown, parsed: ParsedPayload): string {
  if (parsed) {
    const diff = typeof parsed.diff === 'string' ? parsed.diff : '';
    const output = typeof parsed.output === 'string' ? parsed.output : '';
    const error = typeof parsed.error === 'string' ? parsed.error : '';
    const preview = typeof parsed.preview === 'string' ? parsed.preview : '';
    return diff || output || error || preview;
  }
  return typeof payload === 'string' && payload !== 'ok' && payload !== 'running' ? payload : '';
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() || path;
}

function StepIcon({ step }: { step: StepItem }) {
  const label = String(step.label || '').toLowerCase();
  if (step.type === 'thought') {
    return <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>;
  }
  if (step.type === 'file' || label.includes('lecture') || label.includes('modif')) {
    return <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>;
  }
  if (step.type === 'command' || step.type === 'tool' || label.includes('commande')) {
    return <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>;
  }
  if (step.type === 'search' || label.includes('recherche')) {
    return <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
  }
  if (step.type === 'task' || label.includes('plan')) {
    return <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 8l2 2 4-4" /></svg>;
  }
  return <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
}

function stepTitle(step: StepItem, parsed: ParsedPayload): string {
  const label = String(step.label || '');
  if (label.toLowerCase().includes('plan_detected')) return 'Plan de travail détecté';
  if (label.toLowerCase().includes('ollama_chat')) return step.status === 'running' ? 'Génère la réponse' : 'Réponse générée';
  if (step.type === 'thought') return 'Réflexion de l’agent';
  if (parsed?.path && typeof parsed.path === 'string') {
    const file = basename(parsed.path);
    const added = typeof parsed.addedLines === 'number' ? parsed.addedLines : 0;
    const deleted = typeof parsed.deletedLines === 'number' ? parsed.deletedLines : 0;
    const lines = added || deleted ? ` +${added} -${deleted}` : typeof parsed.lines === 'number' && parsed.lines > 0 ? ` +${parsed.lines}` : '';
    if (parsed.kind === 'write_file') return `${file}${lines}`;
    if (parsed.kind === 'read_file') return `Lecture ${file}`;
  }
  if (parsed?.command && typeof parsed.command === 'string') {
    if (step.type === 'search') return step.status === 'running' ? 'Recherche dans le projet' : 'Recherche terminée';
    return step.status === 'running' ? 'Lance une commande' : label || 'Commande terminée';
  }
  return label || 'Étape agent';
}

function stepSubtitle(step: StepItem, parsed: ParsedPayload): string {
  if (parsed?.path && typeof parsed.path === 'string') return parsed.path;
  if (parsed?.command && typeof parsed.command === 'string') return parsed.command;
  if (step.type === 'llm') return String(step.payload || '').replace(/^"|"$/g, '');
  return '';
}

function statusLabel(status: string): string {
  if (status === 'running') return 'en cours';
  if (status === 'failed') return 'erreur';
  return 'terminé';
}

function statusClass(status: string): string {
  if (status === 'running') return 'border-blue-200 bg-blue-50 text-blue-700';
  if (status === 'failed') return 'border-red-200 bg-red-50 text-red-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function stepIdentity(step: StepItem, fallback: number): string {
  const parsed = parseStepPayload(step.payload);
  const id = parsed?.stepId;
  return typeof id === 'string' && id ? id : `${fallback}-${step.type}-${step.label}`;
}

function coalesceSteps(steps: StepItem[]): StepItem[] {
  const order: string[] = [];
  const byId = new Map<string, StepItem>();
  steps.forEach((step, idx) => {
    const id = stepIdentity(step, idx);
    if (!byId.has(id)) order.push(id);
    byId.set(id, step);
  });
  return order.map((id) => byId.get(id)).filter(Boolean) as StepItem[];
}

function DiffBlock({ diff }: { diff: string }) {
  return (
    <pre class="custom-scrollbar max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">
      {diff.split('\n').map((line, idx) => {
        const cls = line.startsWith('+++') || line.startsWith('---')
          ? 'text-gray-400'
          : line.startsWith('+')
            ? 'bg-emerald-950/60 text-emerald-200'
            : line.startsWith('-')
              ? 'bg-red-950/60 text-red-200'
              : 'text-gray-200';
        return <span key={idx} class={`block px-1 ${cls}`}>{line || ' '}</span>;
      })}
    </pre>
  );
}

function StepCard({
  step,
  index,
  expanded,
  onToggle,
  copyToClipboard,
}: {
  step: StepItem;
  index: number;
  expanded: boolean;
  onToggle: () => void;
  copyToClipboard: (text: string) => Promise<void>;
}) {
  const parsed = parseStepPayload(step.payload);
  const detail = payloadText(step.payload, parsed);
  const title = stepTitle(step, parsed);
  const subtitle = stepSubtitle(step, parsed);
  const hasDetail = detail.length > 0;
  const hasDiff = typeof parsed?.diff === 'string' && parsed.diff.length > 0;
  const durationMs = typeof parsed?.durationMs === 'number' ? parsed.durationMs : null;
  const exitCode = typeof parsed?.exitCode === 'number' ? parsed.exitCode : null;
  const accentClass = step.status === 'failed' ? 'border-l-red-400' : step.status === 'running' ? 'border-l-blue-400' : 'border-l-emerald-400';
  const iconClass = step.status === 'failed' ? 'text-red-600 bg-red-50' : step.status === 'running' ? 'text-blue-600 bg-blue-50' : 'text-gray-600 bg-gray-50';

  return (
    <div class={`overflow-hidden rounded-xl border border-gray-200 border-l-4 ${accentClass} bg-white shadow-sm`}>
      <button
        type="button"
        class="flex w-full items-start gap-3 px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
        onClick={hasDetail ? onToggle : undefined}
      >
        <span class={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${iconClass}`}>
          <StepIcon step={step} />
        </span>
        <span class="min-w-0 flex-1">
          <span class="flex min-w-0 items-center gap-2">
            <span class="truncate font-mono text-[12px] font-semibold text-gray-800">{title}</span>
            <span class={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${statusClass(step.status)}`}>
              {statusLabel(step.status)}
            </span>
          </span>
          {subtitle ? (
            <span class="mt-0.5 block truncate font-mono text-[11px] text-gray-400">{subtitle}</span>
          ) : null}
          {durationMs !== null || exitCode !== null ? (
            <span class="mt-1 flex flex-wrap gap-2 font-mono text-[10px] text-gray-400">
              {exitCode !== null ? <span>exit {exitCode}</span> : null}
              {durationMs !== null ? <span>{durationMs} ms</span> : null}
            </span>
          ) : null}
        </span>
        {hasDetail ? (
          <svg class={`mt-1 h-4 w-4 shrink-0 text-gray-400 transition-transform ${expanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
          </svg>
        ) : null}
      </button>
      {hasDetail && expanded ? (
        <div class="border-t border-gray-100 bg-gray-950 px-3 py-2">
          <div class="mb-1 flex items-center justify-between gap-2">
            <span class="font-mono text-[10px] uppercase tracking-widest text-gray-500">{hasDiff ? 'diff' : 'sortie'}</span>
            <div class="flex items-center gap-2">
              {subtitle ? (
                <button
                  type="button"
                  class="rounded border border-gray-800 px-2 py-0.5 font-mono text-[10px] text-gray-400 hover:border-gray-600 hover:text-gray-200"
                  onClick={() => copyToClipboard(subtitle)}
                >
                  copier cible
                </button>
              ) : null}
              <button
                type="button"
                class="rounded border border-gray-800 px-2 py-0.5 font-mono text-[10px] text-gray-400 hover:border-gray-600 hover:text-gray-200"
                onClick={() => copyToClipboard(detail)}
              >
                copier
              </button>
              <span class="font-mono text-[10px] text-gray-600">step #{index + 1}</span>
            </div>
          </div>
          {hasDiff ? (
            <DiffBlock diff={detail} />
          ) : (
            <pre class="custom-scrollbar max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-gray-100">{detail}</pre>
          )}
        </div>
      ) : null}
    </div>
  );
}

function StepLog({ steps, copyToClipboard }: { steps: ChatMessage['steps']; copyToClipboard: (text: string) => Promise<void> }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [allExpanded, setAllExpanded] = useState(false);
  if (!steps || steps.length === 0) return null;

  const visibleSteps = coalesceSteps(steps.filter((s) => s.type !== 'policy' || s.label === 'plan_detected') as StepItem[]);
  if (visibleSteps.length === 0) return null;

  const runningCount = visibleSteps.filter((s) => s.status === 'running').length;
  const failedCount = visibleSteps.filter((s) => s.status === 'failed').length;

  return (
    <div class="mt-4 space-y-2">
      <div class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-gray-400">
        <span class="h-px flex-1 bg-gray-100" />
        <span>{visibleSteps.length} étape{visibleSteps.length > 1 ? 's' : ''}</span>
        {runningCount > 0 ? <span class="text-blue-500">{runningCount} en cours</span> : null}
        {failedCount > 0 ? <span class="text-red-500">{failedCount} erreur{failedCount > 1 ? 's' : ''}</span> : null}
        <button
          type="button"
          class="rounded-full border border-gray-200 px-2 py-0.5 text-[10px] text-gray-400 hover:text-gray-700"
          onClick={() => setAllExpanded((v) => !v)}
        >
          {allExpanded ? 'plier' : 'déplier'}
        </button>
        <span class="h-px flex-1 bg-gray-100" />
      </div>
      <div class="space-y-2">
        {visibleSteps.map((step, idx) => (
          <StepCard
            key={stepIdentity(step, idx)}
            step={step}
            index={idx}
            expanded={allExpanded || expandedIdx === idx || step.type === 'thought' || step.status === 'failed'}
            onToggle={() => setExpandedIdx(expandedIdx === idx ? null : idx)}
            copyToClipboard={copyToClipboard}
          />
        ))}
      </div>
    </div>
  );
}

export default function ChatThread({
  chat, historyLoading, agentId, selectedTeamProfile,
  sending, pollingReply, routingDebug, chatEndRef, copyToClipboard,
  currentSteps
}: Props) {
  return (
    <div class="relative flex min-h-0 flex-1 flex-col bg-[#F8FAFB]">
      {historyLoading && agentId ? (
        <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/60 backdrop-blur-[2px]">
          <span class="loading loading-spinner loading-md text-[#175B37]" />
          <p class="text-xs font-medium text-gray-500">Chargement de la session...</p>
        </div>
      ) : null}

      <div class="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto scroll-smooth px-3 py-4 sm:px-6">
        {chat.length === 0 && !historyLoading && (
          <div class="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-20 text-center animate-fade-in opacity-60">
             <div class="h-16 w-16 rounded-3xl bg-white shadow-sm flex items-center justify-center border border-gray-100">
                <svg class="h-8 w-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
             </div>
             <div class="max-w-xs space-y-1">
                <p class="text-sm font-semibold text-gray-800">{agentId ? 'Début de la conversation' : 'Sélectionnez un agent'}</p>
                <p class="text-xs text-gray-500">Envoyez votre directive pour commencer le travail.</p>
             </div>
          </div>
        )}

        <div class="mx-auto w-full max-w-3xl space-y-8">
          {chat.map((m, i) => {
            const prev = i > 0 ? chat[i - 1] : null;
            const isFirstInGroup = !prev || prev.role !== m.role;
            const isUser = m.role === 'user';

            if (isUser) {
              return (
                <div key={m.id} class="animate-fade-up flex flex-col items-end gap-1.5">
                  <div class="group relative max-w-[85%] rounded-2xl rounded-tr-sm bg-white px-4 py-3 text-[14px] leading-relaxed text-gray-800 shadow-sm border border-gray-100">
                    <Markdown content={m.text} />
                  </div>
                  <div class="flex items-center gap-2 pr-1">
                    <span class="text-[10px] font-medium uppercase tracking-wider text-gray-400">{m.at}</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={m.id} class={`animate-fade-up flex flex-col gap-3 ${isFirstInGroup ? 'mt-4' : 'mt-1'}`}>
                {isFirstInGroup && (
                  <div class="flex items-center gap-2.5 mb-1">
                    <div class="h-6 w-6 shrink-0">
                      {selectedTeamProfile && <TeamAvatar profile={selectedTeamProfile} size="xs" />}
                    </div>
                    <span class="text-xs font-bold text-gray-900 tracking-tight">
                      {selectedTeamProfile?.displayName || 'Assistant'}
                    </span>
                    <span class="h-1 w-1 rounded-full bg-gray-300" />
                    <span class="text-[10px] font-medium text-gray-400 uppercase tracking-widest">{m.at}</span>
                  </div>
                )}
                
                <div class="flex flex-col gap-3 pl-8">
                  <div class={`relative max-w-[95%] rounded-2xl rounded-tl-sm border px-5 py-4 text-[14px] leading-relaxed shadow-sm transition-all
                    ${m.role === 'system' ? 'border-amber-100 bg-amber-50/30 text-amber-900' : 
                      m.isAck ? 'border-sky-100 bg-sky-50/30 text-sky-900' : 
                      'border-gray-200 bg-white text-gray-800'}`}>
                    
                    <Markdown content={m.text} />
                    
                    {m.steps && <StepLog steps={m.steps} copyToClipboard={copyToClipboard} />}
                    
                    {m.role === 'assistant' && m.policy && m.policy.mode !== 'off' ? (
                      <div class="mt-4 flex items-center gap-2">
                        <div class={`h-1.5 w-1.5 rounded-full ${m.policy.state === 'compliant' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        <span class="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                          Mode {m.policy.mode} · {m.policy.state === 'compliant' ? 'conforme' : 'audit requis'}
                        </span>
                      </div>
                    ) : null}
                    
                    {m.remediation && <RemediationGuide remediation={m.remediation} copyToClipboard={copyToClipboard} />}
                  </div>
                </div>
              </div>
            );
          })}
          {(sending || pollingReply) && (
            <div class="animate-fade-up flex flex-col gap-3">
              <div class="flex items-center gap-2.5 mb-1 opacity-50">
                <div class="h-6 w-6 shrink-0">
                  {selectedTeamProfile && <TeamAvatar profile={selectedTeamProfile} size="xs" />}
                </div>
                <span class="text-xs font-bold text-gray-900 tracking-tight italic">Forge réfléchit...</span>
              </div>
              <div class="pl-8 flex flex-col gap-2">
                <div class="flex items-center gap-2 rounded-2xl border border-gray-100 bg-white/50 px-5 py-4 shadow-sm">
                  <span class="loading loading-dots loading-xs text-gray-400" />
                </div>
                {currentSteps && currentSteps.length > 0 && (
                  <div class="animate-fade-in">
                    <StepLog steps={currentSteps} copyToClipboard={copyToClipboard} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div ref={chatEndRef} class="h-6 shrink-0" />
      </div>
    </div>
  );
}
