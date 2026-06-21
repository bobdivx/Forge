import type { JSX } from "preact";

export interface AppCardProps {
  project: {
    id: number;
    name: string;
    description: string | null;
    status: string;
  };
  metrics: {
    pendingRequests: number;
    openIssues: number;
  };
  activeAgentId: string | null;
}

export default function AppCard({
  project,
  metrics,
  activeAgentId,
}: AppCardProps) {
  const isWorking = activeAgentId !== null;

  return (
    <div class="group flex flex-col overflow-hidden rounded-[1.5rem] border border-gray-100 bg-white shadow-sm transition-all duration-200 hover:border-gray-200 hover:shadow-md">
      <div class="p-5 flex-1">
        <div class="flex items-start justify-between mb-4">
          <div>
            <h3 class="text-lg font-bold text-gray-900 group-hover:text-[#175B37] transition-colors">
              {project.name}
            </h3>
            <div class="flex items-center gap-2 mt-1">
              <span
                class={`w-2 h-2 rounded-full ${project.status === "active" ? "bg-emerald-500" : "bg-gray-300"}`}
              ></span>
              <span class="text-[10px] text-gray-500 uppercase tracking-wide">
                {project.status}
              </span>
            </div>
          </div>
          <a
            href={`/apps/by-id/${project.id}`}
            class="text-[#175B37] bg-[#E9F3EB] hover:bg-[#dceee0] p-2 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#175B37]"
            aria-label="Voir les détails du projet"
            title="Voir les détails du projet"
          >
            <svg
              class="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </a>
        </div>

        <p class="text-sm text-gray-600 line-clamp-2 mb-6 h-10">
          {project.description || "Aucune description fournie."}
        </p>

        <div class="flex gap-3 mb-4">
          <div class="flex-1 bg-gray-50 rounded-xl p-3 border border-gray-100 flex items-center justify-between">
            <span class="text-xs text-gray-500">Demandes</span>
            <span class="font-bold text-gray-900">
              {metrics.pendingRequests}
            </span>
          </div>
          <div class="flex-1 bg-red-50/50 rounded-xl p-3 border border-red-100/50 flex items-center justify-between">
            <span class="text-xs text-red-600/80">Bugs</span>
            <span
              class={`font-bold ${metrics.openIssues > 0 ? "text-red-600" : "text-gray-400"}`}
            >
              {metrics.openIssues}
            </span>
          </div>
        </div>
      </div>

      <div
        class={`border-t px-5 py-3 flex items-center gap-3 ${isWorking ? "bg-[#E9F3EB] border-[#175B37]/10" : "bg-gray-50 border-gray-100"}`}
      >
        {isWorking ? (
          <>
            <div class="relative flex h-3 w-3">
              <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#3BAE61] opacity-75"></span>
              <span class="relative inline-flex rounded-full h-3 w-3 bg-[#175B37]"></span>
            </div>
            <span class="text-xs font-medium text-[#175B37]">
              <span class="font-bold">{activeAgentId}</span> y travaille
            </span>
          </>
        ) : (
          <>
            <span class="w-2 h-2 rounded-full bg-gray-300"></span>
            <span class="text-xs font-medium text-gray-500">
              En attente (Aucun agent)
            </span>
          </>
        )}
      </div>
    </div>
  );
}
