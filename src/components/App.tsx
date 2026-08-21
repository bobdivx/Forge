import { h, Fragment } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type { FunctionComponent } from 'preact';

import ApplicationsPage from './pages/ApplicationsPage';
import DeploymentsPage from './pages/DeploymentsPage';
import MonitoringPage from './pages/MonitoringPage';
import ConnexionsPage from './pages/ConnexionsPage';
import StoragePage from './pages/StoragePage';
import ScheduledTasksPage from './pages/ScheduledTasksPage';
import SettingsServersPage from './pages/SettingsServersPage';
import SettingsProjectsPage from './pages/SettingsProjectsPage';
import ApplicationDetailPage from './pages/ApplicationDetailPage';
import NotFoundPage from './pages/NotFoundPage';

interface AppProps {
  initialPath: string;
}

interface Route {
  pattern: RegExp;
  component: FunctionComponent<any>;
  getProps?: (match: RegExpMatchArray) => Record<string, any>;
}

const routes: Route[] = [
  {
    pattern: /^\/applications\/?$/,
    component: ApplicationsPage,
  },
  {
    pattern: /^\/applications\/([^/?]+)\/?$/,
    component: ApplicationDetailPage,
    getProps: (match) => ({ appSlug: match[1] }),
  },
  {
    pattern: /^\/deployments\/?$/,
    component: DeploymentsPage,
  },
  {
    pattern: /^\/monitoring\/?$/,
    component: MonitoringPage,
  },
  {
    pattern: /^\/connexions\/?$/,
    component: ConnexionsPage,
  },
  {
    pattern: /^\/storage\/?$/,
    component: StoragePage,
  },
  {
    pattern: /^\/scheduled-tasks\/?$/,
    component: ScheduledTasksPage,
  },
  {
    pattern: /^\/settings\/servers\/?$/,
    component: SettingsServersPage,
  },
  {
    pattern: /^\/settings\/projects\/?$/,
    component: SettingsProjectsPage,
  },
];

export function App({ initialPath }: AppProps) {
  const [currentPath, setCurrentPath] = useState(initialPath);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname + window.location.search);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigate = (path: string) => {
    window.history.pushState(null, '', path);
    setCurrentPath(path);
  };

  const pathWithoutQuery = currentPath.split('?')[0];
  const searchParams = new URLSearchParams(currentPath.split('?')[1] || '');

  for (const route of routes) {
    const match = pathWithoutQuery.match(route.pattern);
    if (match) {
      const Component = route.component;
      const props = route.getProps ? route.getProps(match) : {};
      return <Component {...props} searchParams={searchParams} navigate={navigate} />;
    }
  }

  return <NotFoundPage navigate={navigate} />;
}
