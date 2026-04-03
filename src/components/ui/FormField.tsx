import type { ComponentChildren } from 'preact';

type Props = {
  label: string;
  hint?: string;
  children: ComponentChildren;
  className?: string;
};

export default function FormField({ label, hint, children, className = '' }: Props) {
  return (
    <div class={className}>
      <label class="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
        {label}
      </label>
      {children}
      {hint && <p class="text-[10px] text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}
