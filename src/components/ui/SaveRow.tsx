import type { ComponentChildren } from 'preact';

type Props = {
  message?: string;
  saving: boolean;
  onSave: () => void;
  label?: string;
  extraActions?: ComponentChildren;
};

export default function SaveRow({
  message,
  saving,
  onSave,
  label = 'Sauvegarder',
  extraActions,
}: Props) {
  const isError = message?.toLowerCase().includes('erreur');
  return (
    <div class="pt-4 flex items-center justify-between gap-4 border-t border-slate-800 flex-wrap">
      {message ? (
        <span class={`text-sm ${isError ? 'text-red-400' : 'text-emerald-400'}`}>{message}</span>
      ) : (
        <span />
      )}
      <div class="flex gap-2">
        {extraActions}
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          class={`btn btn-primary text-xs h-9 min-h-0 ${saving ? 'loading' : ''}`}
        >
          {label}
        </button>
      </div>
    </div>
  );
}
