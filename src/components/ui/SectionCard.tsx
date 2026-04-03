import type { ComponentChildren } from 'preact';

type Props = {
  title: string;
  description?: string;
  children: ComponentChildren;
  className?: string;
};

export default function SectionCard({ title, description, children, className = '' }: Props) {
  return (
    <div class={`bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl ${className}`}>
      <div class="p-6 space-y-6">
        <div>
          <h3 class="font-semibold text-white mb-1">{title}</h3>
          {description && <p class="text-xs text-slate-400">{description}</p>}
        </div>
        {children}
      </div>
    </div>
  );
}
