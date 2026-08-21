import { h } from 'preact';

interface Props {
  navigate: (path: string) => void;
}

export default function NotFoundPage({ navigate }: Props) {
  return (
    <div class="dashboard-content">
      <div class="card p-8 text-center max-w-md mx-auto mt-20">
        <div class="text-6xl mb-4">🔍</div>
        <h1 class="text-2xl font-bold text-gray-900 mb-2">Ressource introuvable</h1>
        <p class="text-gray-600 mb-6">
          La page que vous recherchez n'existe pas ou a été déplacée.
        </p>
        <div class="flex gap-3 justify-center">
          <button onClick={() => navigate('/applications/')} class="btn btn-primary">
            ← Retour aux applications
          </button>
          <button onClick={() => window.location.href = '/dashboard'} class="btn btn-ghost">
            Tableau de bord
          </button>
        </div>
      </div>
    </div>
  );
}
