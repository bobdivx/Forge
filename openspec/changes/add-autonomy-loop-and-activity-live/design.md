# Design

## Autonomy loop

`src/lib/forge-autonomy-loop.ts` :

```ts
export type AutonomyMode = 'on' | 'off' | 'quiet_hours';

export type SubDaemonHealth = {
  name: 'scheduler' | 'bug_detector' | 'github_watcher' | 'tech_watch';
  running: boolean;
  lastError: string | null;
  lastTickAt: string | null;
};

export type AutonomyStatus = {
  mode: AutonomyMode;
  quietHours: string;
  inQuietHours: boolean;
  subDaemons: SubDaemonHealth[];
  bootedAt: string | null;
};

export async function startAutonomyLoop(): Promise<void>;
export async function setAutonomyMode(mode: AutonomyMode): Promise<void>;
export function getAutonomyStatus(): AutonomyStatus;
export function isInQuietHours(now?: Date, range?: string): boolean;
```

- Au démarrage : lit `Config.autonomyMode`. Si `off`, ne fait rien. Sinon lance tous les sub-daemons via try/catch isolés (Promise.allSettled).
- Health-check : `setInterval` 10 min qui inspecte le statut des daemons. Si un daemon est mort (status `running=false` mais doit l'être), tente un restart.

## Quiet hours

Format `HH:MM-HH:MM` (24h, peut traverser minuit). Helper pure-functional, testable.

## SSE Activity Live

Endpoint `/api/forge-activity-stream` :
- Response `text/event-stream`, no-cache, keep-alive.
- Boucle `setInterval(2000)` qui SELECT `ActivityLog` créés depuis le dernier ID envoyé (curseur stocké dans la closure).
- À chaque nouvelle ligne → `data: { id, actorType, actorId, action, entityType, createdAt }\n\n`
- Le client `ActivityLive.tsx` ouvre une `EventSource`, accumule un buffer borné (200 lignes max) et auto-scroll.

## Mode bascule

- `POST /api/autonomy/mode { mode: 'on'|'off'|'quiet_hours' }` met à jour `Config.autonomyMode` puis appelle `setAutonomyMode()` qui démarre/arrête les daemons en conséquence.
