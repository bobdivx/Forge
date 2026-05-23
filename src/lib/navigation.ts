export type NavItem = {
  id: string;
  name: string;
  path: string;
  iconPath: string;
  match: string[];
  badge?: string | null;
  groupId: 'pilot' | 'collaborate' | 'govern' | 'configure';
};

export type NavGroup = {
  id: NavItem['groupId'];
  label: string;
  items: NavItem[];
};

const navItems: NavItem[] = [
  {
    id: 'dashboard',
    name: 'Applications',
    path: '/dashboard',
    iconPath:
      'M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z',
    match: ['/dashboard'],
    groupId: 'pilot',
  },
  {
    id: 'docker',
    name: 'Supervision Docker',
    path: '/docker',
    iconPath:
      'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
    match: ['/docker'],
    groupId: 'pilot',
  },
  {
    id: 'health',
    name: 'Sante',
    path: '/health',
    iconPath:
      'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    match: ['/health'],
    groupId: 'pilot',
  },
  {
    id: 'agents',
    name: "L'Equipe",
    path: '/agents',
    iconPath:
      'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
    match: ['/agents', '/swarm'],
    groupId: 'collaborate',
  },
  {
    id: 'discussion',
    name: 'Discussion',
    path: '/discussion',
    iconPath:
      'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
    match: ['/discussion'],
    groupId: 'collaborate',
  },
  {
    id: 'work',
    name: 'Carnet de bord',
    path: '/work',
    iconPath:
      'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01',
    match: ['/work', '/reports', '/needs'],
    groupId: 'collaborate',
  },
  {
    id: 'costs',
    name: 'Couts et Budget',
    path: '/costs',
    iconPath:
      'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    match: ['/costs'],
    groupId: 'govern',
  },
  {
    id: 'routine',
    name: 'Routine',
    path: '/routine',
    iconPath: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    match: ['/routine'],
    groupId: 'govern',
  },
  {
    id: 'orchestration',
    name: 'Approbations',
    path: '/orchestration',
    iconPath:
      'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    match: ['/orchestration'],
    groupId: 'govern',
  },
  {
    id: 'settings',
    name: 'Parametres',
    path: '/settings',
    iconPath:
      'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065',
    match: ['/settings', '/ai'],
    groupId: 'configure',
  },
  {
    id: 'plugins',
    name: 'Plugins & Modules',
    path: '/plugins',
    iconPath:
      'M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z',
    match: ['/plugins'],
    groupId: 'configure',
  },
  {
    id: 'help',
    name: 'Aide',
    path: '/help',
    iconPath:
      'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    match: ['/help'],
    groupId: 'configure',
  },
  {
    id: 'logout',
    name: 'Deconnexion',
    path: '/api/auth/logout',
    iconPath:
      'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
    match: [],
    groupId: 'configure',
  },
];

export const navGroups: NavGroup[] = [
  { id: 'pilot', label: 'Piloter', items: navItems.filter((item) => item.groupId === 'pilot') },
  { id: 'collaborate', label: 'Collaborer', items: navItems.filter((item) => item.groupId === 'collaborate') },
  { id: 'govern', label: 'Gouverner', items: navItems.filter((item) => item.groupId === 'govern') },
  { id: 'configure', label: 'Configurer', items: navItems.filter((item) => item.groupId === 'configure') },
];

export function isNavItemActive(currentPath: string, item: NavItem): boolean {
  return item.match.some((m) => currentPath === m || currentPath.startsWith(`${m}/`));
}
