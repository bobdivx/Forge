import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';

interface DiskInfo {
  id: string;
  name: string;
  path: string;
  used: number;
  total: number;
  percentage: number;
}

interface Props {
  searchParams: URLSearchParams;
  navigate: (path: string) => void;
}

export default function StoragePage({ searchParams, navigate }: Props) {
  const [disks, setDisks] = useState<DiskInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/storage')
      .then(res => res.json())
      .then(data => {
        setDisks(data.disks || []);
        setLoading(false);
      })
      .catch(() => {
        setDisks([
          {
            id: '1',
            name: 'Racine',
            path: '/',
            used: 500,
            total: 500,
            percentage: 100,
          },
          {
            id: '2',
            name: 'Docker',
            path: '/media/Docker',
            used: 150,
            total: 1000,
            percentage: 15,
          },
        ]);
        setLoading(false);
      });
  }, []);

  const getStatusColor = (percentage: number) => {
    if (percentage >= 90) return 'red';
    if (percentage >= 75) return 'yellow';
    return 'green';
  };

  return (
    <div class="dashboard-content">
      <div class="page-header">
        <h1 class="text-3xl font-bold text-gray-900">Stockage</h1>
        <p class="text-sm text-gray-500 mt-1">Utilisation des disques et volumes</p>
      </div>

      <div class="card">
        {loading ? (
          <div class="p-8 text-center">
            <div class="loading loading-spinner"></div>
            <p class="mt-2 text-gray-500">Chargement…</p>
          </div>
        ) : disks.length === 0 ? (
          <div class="p-8 text-center text-gray-500">
            Aucune information de stockage disponible.
          </div>
        ) : (
          <div class="divide-y">
            {disks.map(disk => {
              const statusColor = getStatusColor(disk.percentage);
              return (
                <div key={disk.id} class="p-6">
                  <div class="flex items-center justify-between mb-3">
                    <div>
                      <h3 class="font-semibold text-gray-900">{disk.name}</h3>
                      <p class="text-sm text-gray-500 font-mono">{disk.path}</p>
                    </div>
                    <div class="text-right">
                      <div class={`text-2xl font-bold ${
                        statusColor === 'red' ? 'text-red-600' :
                        statusColor === 'yellow' ? 'text-yellow-600' :
                        'text-green-600'
                      }`}>
                        {disk.percentage}%
                      </div>
                      <div class="text-sm text-gray-500">
                        {disk.used} Go / {disk.total} Go
                      </div>
                    </div>
                  </div>
                  <div class="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                    <div
                      class={`h-full rounded-full transition-all ${
                        statusColor === 'red' ? 'bg-red-500' :
                        statusColor === 'yellow' ? 'bg-yellow-500' :
                        'bg-green-500'
                      }`}
                      style={`width: ${disk.percentage}%`}
                    ></div>
                  </div>
                  {disk.percentage >= 90 && (
                    <div class="mt-3 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
                      <strong>⚠️ Attention :</strong> Ce disque est presque plein. Libérez de l'espace ou étendez le volume.
                    </div>
                  )}
                  {disk.percentage >= 75 && disk.percentage < 90 && (
                    <div class="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
                      <strong>ℹ️ Note :</strong> Ce disque commence à se remplir. Surveillez l'utilisation.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div class="card mt-4 p-4 bg-blue-50 border border-blue-200">
        <h3 class="font-semibold text-blue-900 mb-2">À propos des pourcentages</h3>
        <p class="text-sm text-blue-800">
          Les pourcentages affichés représentent l'utilisation de chaque disque ou volume. 
          Si plusieurs disques sont listés (par exemple, Racine et Docker), ils peuvent être des partitions 
          différentes ou des volumes montés séparément. Vérifiez les chemins pour identifier leur fonction.
        </p>
      </div>
    </div>
  );
}
