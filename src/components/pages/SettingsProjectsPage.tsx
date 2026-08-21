import { h } from 'preact';

interface Props {
  searchParams: URLSearchParams;
  navigate: (path: string) => void;
}

export default function SettingsProjectsPage({ searchParams, navigate }: Props) {
  return (
    <div class="dashboard-content">
      <div class="page-header">
        <h1 class="text-3xl font-bold text-gray-900">Paramètres · DevForge</h1>
        <p class="text-sm text-gray-500 mt-1">Configuration des projets</p>
      </div>

      <div class="card p-6">
        <h2 class="text-lg font-semibold mb-4">Projets</h2>
        <p class="text-gray-600">Configuration et gestion des projets</p>
      </div>
    </div>
  );
}
