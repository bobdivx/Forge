import { createPortal } from 'preact/compat';
import { useState } from 'preact/hooks';

export default function MobileMenu({
  currentPath,
  pathname: pathnameProp,
}: {
  currentPath: string;
  pathname?: string;
}) {
  const navItems = [
    { name: "Vue d'ensemble", path: "/dashboard", icon: "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" },
    { name: "Applications", path: "/apps", icon: "M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-10.5v9" },
    { name: "Agents", path: "/agents", icon: "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" },
    { name: "Orchestration", path: "/orchestration", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
    { name: "Rapports", path: "/reports", icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" },
    { name: "Demandes", path: "/needs", icon: "M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" },
    { name: "Paramètres", path: "/settings", icon: "M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" },
    { name: "Aide", path: "/help", icon: "M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z" },
  ];

  const pathname = pathnameProp || (typeof globalThis !== 'undefined' && 'location' in globalThis ? (globalThis as unknown as { location: { pathname: string } }).location.pathname : '');

  function navItemActive(itemPath: string) {
    if (itemPath === '/apps') return pathname.startsWith('/apps');
    return pathname === itemPath || currentPath === itemPath;
  }

  const [isOpen, setIsOpen] = useState(false);
  const closeDrawer = () => setIsOpen(false);

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)} class="btn btn-ghost btn-square btn-sm md:hidden text-slate-300 hover:text-white" aria-label="Toggle Menu">
        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" /></svg>
      </button>

      {isOpen && createPortal(
        <div class="fixed inset-0 z-[2147483647] md:hidden">
          <button type="button" class="absolute inset-0 bg-black/70 backdrop-blur-sm" aria-label="Fermer le menu" onClick={closeDrawer} />
          <div class="relative z-10 flex h-full w-72 max-w-[85vw] flex-col bg-base-200 text-base-content shadow-2xl">
            <div class="flex h-16 shrink-0 items-center justify-between px-6 border-b border-base-300">
              <div class="flex items-center gap-2">
                <div class="h-8 w-8 rounded bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-lg shadow-lg shadow-blue-500/20">F</div>
                <span class="text-xl font-bold tracking-tight">DevForge</span>
              </div>
              <button type="button" class="btn btn-ghost btn-square btn-sm" aria-label="Fermer le menu" onClick={closeDrawer}>
                <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <nav class="flex-1 overflow-y-auto py-4">
              <ul class="menu w-full px-3">
                {navItems.map((item) => (
                  <li key={item.path}>
                    <a href={item.path} onClick={closeDrawer} class={`flex items-center gap-3 ${navItemActive(item.path) ? 'active' : ''}`}>
                      <svg class="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d={item.icon} /></svg>
                      {item.name}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <div class="border-t border-base-300 p-4 flex items-center gap-3">
              <div class="avatar placeholder">
                <div class="bg-neutral text-neutral-content w-9 rounded-full"><span class="text-sm font-bold">M</span></div>
              </div>
              <div class="flex flex-col"><span class="text-sm font-semibold">Mathieu</span><span class="text-xs opacity-70">Admin</span></div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
