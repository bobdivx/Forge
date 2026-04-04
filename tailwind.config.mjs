import daisyui from 'daisyui';

export default {
  content: ['./src/**/*.{astro,html,js,jsx,ts,tsx}'],
  theme: {
    extend: {
      boxShadow: {
        'neon-card':
          'inset 0 1px 0 0 rgba(255,255,255,0.08), 0 0 0 1px rgba(34,211,238,0.12), 0 0 28px rgba(34,211,238,0.14), 0 24px 56px -12px rgba(0,0,0,0.55)',
        'neon-card-lg':
          'inset 0 1px 0 0 rgba(255,255,255,0.09), 0 0 0 1px rgba(34,211,238,0.22), 0 0 36px rgba(34,211,238,0.22), 0 0 72px rgba(168,85,247,0.1), 0 24px 56px -12px rgba(0,0,0,0.55)',
        'neon-cyan': '0 0 0 1px rgba(34, 211, 238, 0.2), 0 0 24px rgba(34, 211, 238, 0.18), 0 0 48px rgba(34, 211, 238, 0.06)',
        'neon-cyan-lg': '0 0 0 1px rgba(34, 211, 238, 0.25), 0 0 32px rgba(34, 211, 238, 0.28), 0 0 80px rgba(168, 85, 247, 0.12)',
        'neon-fuchsia': '0 0 0 1px rgba(217, 70, 239, 0.25), 0 0 28px rgba(217, 70, 239, 0.2)',
        'glass-inset': 'inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
        'glass-depth': '0 24px 48px -12px rgba(0, 0, 0, 0.55)',
      },
      backgroundImage: {
        'forge-mesh':
          'radial-gradient(ellipse 90% 60% at 50% -30%, rgba(34,211,238,0.14) 0%, transparent 55%), radial-gradient(ellipse 50% 40% at 100% 20%, rgba(168,85,247,0.12) 0%, transparent 50%), radial-gradient(ellipse 45% 35% at 0% 90%, rgba(217,70,239,0.1) 0%, transparent 50%)',
      },
    },
  },
  plugins: [daisyui],
  daisyui: {
    themes: ['dark'],
  },
};
