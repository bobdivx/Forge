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
    <div class="pt-4 flex items-center justify-between gap-4 border-t border-gray-200 flex-wrap">
      {message ? (
        <span class={`text-sm font-medium ${isError ? 'text-red-500' : 'text-green-600'}`}>{message}</span>
      ) : (
        <span />
      )}
      <div class="flex gap-2">
        {extraActions}
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          class="px-5 py-2 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style="background:#175B37"
        >
          {saving ? 'Sauvegarde…' : label}
        </button>
      </div>
    </div>
  );
}
