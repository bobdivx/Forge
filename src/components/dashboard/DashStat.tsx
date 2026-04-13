type Props = {
  label: string;
  value: number | string;
  sub?: string;
  href?: string;
  accent?: boolean;
};

export function DashStat({ label, value, sub, href, accent }: Props) {
  const inner = (
    <div
      class={`p-5 rounded-[1.5rem] shadow-sm flex flex-col justify-between h-40 ${
        accent ? 'text-white' : 'bg-white text-gray-800'
      }`}
      style={accent ? { background: '#175B37' } : {}}
    >
      <div class="flex justify-between items-start">
        <span class={`font-medium text-sm ${accent ? 'text-white/90' : 'text-gray-600'}`}>{label}</span>
        <div
          class={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${
            accent ? 'bg-white text-black' : 'border border-gray-200 text-gray-600'
          }`}
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 19L19 5m0 0v10m0-10H9" />
          </svg>
        </div>
      </div>
      <div>
        <h2 class={`text-5xl font-bold mb-2 ${accent ? 'text-white' : 'text-gray-800'}`}>{value}</h2>
        {sub && (
          <div class={`flex items-center gap-2 text-xs ${accent ? 'text-white/70' : 'text-gray-400'}`}>
            <span
              class={`px-2 py-0.5 rounded flex items-center gap-1 ${
                accent ? 'bg-white/20' : 'bg-gray-100 text-gray-500'
              }`}
            >
              <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" />
              </svg>
            </span>
            {sub}
          </div>
        )}
      </div>
    </div>
  );

  return href ? (
    <a href={href} class="block no-underline text-inherit">
      {inner}
    </a>
  ) : (
    inner
  );
}
