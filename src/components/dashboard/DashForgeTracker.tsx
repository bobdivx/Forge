import { useState, useEffect } from "preact/hooks";

export default function DashForgeTracker() {
  const [now, setNow] = useState(new Date());
  const [startTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const elapsed = Math.floor((now.getTime() - startTime.getTime()) / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  const hh = pad(Math.floor(elapsed / 3600));
  const mm = pad(Math.floor((elapsed % 3600) / 60));
  const ss = pad(elapsed % 60);

  return (
    <div
      class="text-white p-6 rounded-[1.5rem] shadow-sm relative overflow-hidden flex flex-col justify-between"
      style={{
        background: "linear-gradient(135deg, #0B2717 0%, #175B37 100%)",
      }}
    >
      {/* Decorative circles (like in Donezo) */}
      <div
        class="absolute -right-8 -bottom-8 pointer-events-none"
        aria-hidden="true"
      >
        <div class="w-44 h-44 rounded-full border-4 border-white opacity-10" />
        <div class="absolute inset-2 rounded-full border-4 border-white opacity-10" />
        <div class="absolute inset-4 rounded-full border-4 border-white opacity-10" />
        <div class="absolute inset-6 rounded-full border-4 border-white opacity-10" />
      </div>

      <div class="relative z-10">
        <h3 class="font-semibold text-white/90 mb-6">Traceur de session</h3>
        <div class="text-[2.5rem] font-bold text-center tracking-wider font-mono mb-8">
          {hh}:{mm}:{ss}
        </div>
        <div class="flex justify-center gap-3">
          <button
            class="w-10 h-10 bg-white rounded-full flex items-center justify-center hover:bg-gray-100 transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#175B37] outline-none"
            style={{ color: "#175B37" }}
            title="Pause"
            aria-label="Mettre en pause le traceur de session"
          >
            <svg
              class="w-4 h-4"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fill-rule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z"
                clip-rule="evenodd"
              />
            </svg>
          </button>
          <a
            href="/api/auth/logout"
            class="w-10 h-10 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#175B37] outline-none"
            style={{ boxShadow: "0 4px 12px rgba(239,68,68,0.4)" }}
            title="Déconnexion"
            aria-label="Se déconnecter"
          >
            <svg
              class="w-4 h-4"
              fill="currentColor"
              viewBox="0 0 20 20"
              aria-hidden="true"
            >
              <path
                fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z"
                clip-rule="evenodd"
              />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}
