import { createPortal } from 'preact/compat';
import { useState } from 'preact/hooks';

const menuItems = [
  {
    name: "Vue d'ensemble",
    path: '/dashboard',
    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
    match: ['/dashboard'],
  },
  {
    name: "L'Équipe",
    path: '/agents',
    icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
    match: ['/agents', '/swarm'],
  },
  {
    name: 'Projets',
    path: '/apps',
    icon: 'M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-10.5v9',
    match: ['/apps'],
  },
  {
    name: 'Discussion',
    path: '/discussion',
    icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    match: ['/discussion'],
  },
  {
    name: 'Carnet de bord',
    path: '/work',
    icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
    match: ['/work', '/reports', '/needs'],
  },
  {
    name: 'Coûts & Budget',
    path: '/costs',
    icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    match: ['/costs'],
  },
  {
    name: 'Approbations',
    path: '/orchestration',
    icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    match: ['/orchestration'],
  },
  {
    name: 'Santé',
    path: '/health',
    icon: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    match: ['/health'],
  },
];

const generalItems = [
  {
    name: 'Paramètres',
    path: '/settings',
    icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
    match: ['/settings', '/ai', '/help'],
  },
  {
    name: 'Déconnexion',
    path: '/api/auth/logout',
    icon: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
    match: [],
  },
];

export default function MobileMenu({
  currentPath,
  pathname: pathnameProp,
}: {
  currentPath: string;
  pathname?: string;
}) {
  const pathname =
    pathnameProp ||
    (typeof globalThis !== 'undefined' && 'location' in globalThis
      ? (globalThis as unknown as { location: { pathname: string } }).location.pathname
      : '');

  function isActive(item: (typeof menuItems)[0] | (typeof generalItems)[0]) {
    const p = pathname || currentPath;
    return item.match.some((m) => p === m || p.startsWith(m + '/'));
  }

  const [isOpen, setIsOpen] = useState(false);
  const closeDrawer = () => setIsOpen(false);

  return (
    <>
      {/* Hamburger button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        class="w-9 h-9 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors md:hidden"
        aria-label="Ouvrir le menu"
      >
        <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {isOpen &&
        createPortal(
          <div class="fixed inset-0 z-[2147483647] md:hidden">
            {/* Backdrop */}
            <button
              type="button"
              class="absolute inset-0 bg-black/30 backdrop-blur-sm"
              aria-label="Fermer le menu"
              onClick={closeDrawer}
            />

            {/* Drawer */}
            <div
              class="relative z-10 flex h-full flex-col shadow-xl"
              style="width:280px;max-width:85vw;background:#F4F7F5"
            >
              {/* Header */}
              <div
                class="flex h-16 shrink-0 items-center justify-between px-5"
                style="background:white;border-bottom:1px solid #E5E7EB"
              >
                <div class="flex items-center gap-3">
                  <div
                    class="w-8 h-8 rounded-full border-[3px] flex items-center justify-center"
                    style="border-color:#3BAE61"
                  >
                    <div class="w-3 h-3 rounded-full" style="background:#175B37"></div>
                  </div>
                  <span class="text-lg font-bold text-gray-900">DevForge</span>
                </div>
                <button
                  type="button"
                  class="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"
                  aria-label="Fermer le menu"
                  onClick={closeDrawer}
                >
                  <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Nav */}
              <nav class="flex-1 overflow-y-auto p-4 space-y-6">
                <div>
                  <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-2">MENU</p>
                  <div class="space-y-1">
                    {menuItems.map((item) => {
                      const active = isActive(item);
                      return (
                        <a
                          key={item.path}
                          href={item.path}
                          onClick={closeDrawer}
                          class="flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-colors"
                          style={active
                            ? 'background:#E9F3EB;color:#175B37'
                            : 'color:#6B7280'}
                        >
                          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={item.icon} />
                          </svg>
                          {item.name}
                        </a>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-2">GENERAL</p>
                  <div class="space-y-1">
                    {generalItems.map((item) => {
                      const active = isActive(item);
                      return (
                        <a
                          key={item.path}
                          href={item.path}
                          onClick={closeDrawer}
                          class="flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-colors"
                          style={active
                            ? 'background:#E9F3EB;color:#175B37'
                            : 'color:#6B7280'}
                        >
                          <svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={item.icon} />
                          </svg>
                          {item.name}
                        </a>
                      );
                    })}
                  </div>
                </div>
              </nav>

              {/* OpenClaw banner at bottom */}
              <div class="p-4">
                <div
                  class="rounded-2xl p-4 text-white relative overflow-hidden"
                  style="background:linear-gradient(135deg,#0B2717 0%,#175B37 100%)"
                >
                  <div class="w-7 h-7 rounded-full flex items-center justify-center mb-3" style="background:rgba(255,255,255,0.2)">
                    <svg class="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/>
                    </svg>
                  </div>
                  <p class="text-sm font-semibold mb-0.5">Accéder à OpenClaw</p>
                  <p class="text-[11px] mb-3" style="color:rgba(255,255,255,0.7)">Interface de contrôle avancée</p>
                  <a
                    href="/settings"
                    onClick={closeDrawer}
                    class="block w-full py-1.5 text-center text-xs font-semibold rounded-full transition-opacity hover:opacity-90"
                    style="background:#175B37;color:white"
                  >
                    Ouvrir
                  </a>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
