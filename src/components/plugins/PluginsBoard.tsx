import { useState } from 'preact/hooks';
import TabBar from '../ui/TabBar';
import AgentToolsCatalog from '../settings/AgentToolsCatalog';
import ModuleStoreTab, { type ForgeModule } from '../settings/ModuleStoreTab';
import ModuleDetailConfig from './ModuleDetailConfig';

const TABS = [
  { id: 'store', label: 'Store de Plugins & Modules' },
  { id: 'tools', label: 'MCP & Outils Custom' },
];

export default function PluginsBoard() {
  const [activeTab, setActiveTab] = useState('store');
  const [selectedModule, setSelectedModule] = useState<ForgeModule | null>(null);

  const handleSelectModule = (mod: ForgeModule) => {
    setSelectedModule(mod);
  };

  const handleBackToStore = () => {
    setSelectedModule(null);
  };

  const handleRefresh = () => {
    // Si nécessaire, on peut re-fetcher ou actualiser l'état
  };

  return (
    <div className="space-y-6">
      <TabBar tabs={TABS} active={activeTab} onChange={(tab) => {
        setActiveTab(tab);
        // Réinitialiser la sélection au changement d'onglet principal
        if (tab !== 'store') {
          setSelectedModule(null);
        }
      }} tone="forge" />

      <div className="bg-white border border-gray-100 rounded-[2rem] shadow-sm min-h-[400px] overflow-hidden">
        {activeTab === 'store' && (
          <div>
            {selectedModule ? (
              <ModuleDetailConfig
                module={selectedModule}
                onBack={handleBackToStore}
                onRefresh={handleRefresh}
              />
            ) : (
              <div className="p-6 md:p-8">
                <ModuleStoreTab onSelectModule={handleSelectModule} />
              </div>
            )}
          </div>
        )}

        {activeTab === 'tools' && (
          <div className="p-6 md:p-8 text-left">
            <div className="mb-6">
              <h3 className="text-lg font-bold text-gray-900">MCP & Outils système</h3>
              <p className="text-xs text-gray-500 mt-1">
                Gérez les capabilities de vos agents. Déclarez de nouveaux outils personnalisés (via exécutions de commandes templates ou connexions à des serveurs d'outils MCP) et affectez-les à vos agents.
              </p>
            </div>
            <AgentToolsCatalog />
          </div>
        )}
      </div>
    </div>
  );
}
