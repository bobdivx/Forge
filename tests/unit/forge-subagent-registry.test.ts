import { describe, expect, it, vi, beforeEach } from 'vitest';

// Stub DB en mémoire pour valider la logique pure du registry.
type RunRow = Record<string, unknown>;
let runs: RunRow[] = [];
let nextId = 1;

vi.mock('../../src/lib/forge-activity-log', () => ({
  insertForgeActivityLog: async () => undefined,
}));

vi.mock('drizzle-orm', () => ({
  eq: (col: unknown, val: unknown) => ({ __op: 'eq', col, val }),
  desc: (col: unknown) => ({ __op: 'desc', col }),
  and: (...args: unknown[]) => ({ __op: 'and', args }),
}));

vi.mock('../../src/lib/load-astro-db', () => ({
  loadAstroDb: async () => {
    const SubagentRunCol = { id: 'id', parentAgentId: 'parentAgentId', childAgentId: 'childAgentId', status: 'status' } as Record<string, string>;
    return {
      db: {
        insert: (_table: unknown) => ({
          values: (v: RunRow) => ({
            returning: async () => {
              const row: RunRow = { ...v, id: nextId++ };
              runs.push(row);
              return [row];
            },
          }),
        }),
        update: (_table: unknown) => ({
          set: (patch: RunRow) => ({
            where: async (cond: { __op?: string; val?: unknown }) => {
              const id = Number(cond?.val);
              const idx = runs.findIndex((r) => Number(r.id) === id);
              if (idx >= 0) runs[idx] = { ...runs[idx], ...patch };
              return;
            },
          }),
        }),
        select: () => ({
          from: (_table: unknown) => {
            const proxy = {
              orderBy: () => proxy,
              where: () => proxy,
              limit: async () => [...runs].reverse(),
              then: undefined,
            } as unknown as { orderBy: () => unknown; where: () => unknown; limit: (n: number) => Promise<RunRow[]> };
            return proxy;
          },
        }),
      },
      SubagentRun: SubagentRunCol,
    };
  },
}));

import {
  startSubagentRun,
  markSubagentRunning,
  completeSubagentRun,
  failSubagentRun,
  listSubagentRuns,
} from '../../src/lib/forge-subagent-registry';

describe('forge-subagent-registry', () => {
  beforeEach(() => {
    runs = [];
    nextId = 1;
  });

  it('crée un run pending', async () => {
    const run = await startSubagentRun({
      parentAgentId: 'CHEF_TECHNIQUE',
      childAgentId: 'DEV_BACKEND__APP_FORGE',
      projectId: 1,
      reason: 'test',
    });
    expect(run).not.toBeNull();
    expect(run!.status).toBe('pending');
    expect(run!.parentAgentId).toBe('CHEF_TECHNIQUE');
    expect(run!.childAgentId).toBe('DEV_BACKEND__APP_FORGE');
  });

  it('transitionne pending → running → completed', async () => {
    const run = await startSubagentRun({
      parentAgentId: 'CHEF_TECHNIQUE',
      childAgentId: 'DEV_FRONTEND__APP_X',
    });
    await markSubagentRunning(run!.id);
    await completeSubagentRun(run!.id, 'résultat');
    const items = await listSubagentRuns({ limit: 10 });
    const found = items.find((r) => r.id === run!.id);
    expect(found?.status).toBe('completed');
    expect(found?.output).toBe('résultat');
  });

  it('marque failed avec erreur', async () => {
    const run = await startSubagentRun({
      parentAgentId: 'ARCHITECTE_LOGICIEL',
      childAgentId: 'TESTEUR_QA__APP_Y',
    });
    await failSubagentRun(run!.id, 'timeout');
    const items = await listSubagentRuns({ limit: 10 });
    const found = items.find((r) => r.id === run!.id);
    expect(found?.status).toBe('failed');
    expect(found?.error).toBe('timeout');
  });
});
