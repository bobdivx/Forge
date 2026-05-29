import type { ForgePlugin } from '../src/lib/forge-plugin-loader';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

// Memory storage file path
const memoryDir = join(process.cwd(), '.forge');
const memoryFile = join(memoryDir, 'memory.json');

async function ensureMemoryFile() {
  try {
    await mkdir(memoryDir, { recursive: true });
    try {
      await readFile(memoryFile, 'utf-8');
    } catch {
      await writeFile(memoryFile, JSON.stringify({ facts: [] }), 'utf-8');
    }
  } catch (err) {
    console.error('Failed to initialize memory directory:', err);
  }
}

async function performMemoryRead(): Promise<string> {
  await ensureMemoryFile();
  try {
    const data = await readFile(memoryFile, 'utf-8');
    const parsed = JSON.parse(data);
    if (!parsed.facts || parsed.facts.length === 0) {
      return 'No memories stored yet.';
    }
    return 'Stored Memory Facts:\n' + parsed.facts.map((f: string, i: number) => `${i + 1}. ${f}`).join('\n');
  } catch (err: any) {
    return `Error reading memory: ${err.message}`;
  }
}

async function performMemoryWrite(args: { fact: string }): Promise<string> {
  await ensureMemoryFile();
  try {
    const data = await readFile(memoryFile, 'utf-8');
    const parsed = JSON.parse(data);
    parsed.facts = parsed.facts || [];
    parsed.facts.push(args.fact);
    await writeFile(memoryFile, JSON.stringify(parsed, null, 2), 'utf-8');
    return `Fact successfully saved to memory: "${args.fact}"`;
  } catch (err: any) {
    return `Error writing to memory: ${err.message}`;
  }
}

const MemoryModule: ForgePlugin = {
  name: 'module-memory',
  version: '1.0.0',
  tools: [
    {
      name: 'memory_read',
      displayName: 'Lire la mémoire',
      description: 'Lit les faits importants et le contexte stockés dans la mémoire persistante de l\'agent.',
      category: 'filesystem',
      parameters: {
        type: 'object',
        properties: {},
      },
      implementationKind: 'builtin',
      implementationConfig: { handler: 'memory_read' },
      classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
    },
    {
      name: 'memory_write',
      displayName: 'Écrire dans la mémoire',
      description: 'Enregistre un fait important, une règle ou un contexte dans la mémoire persistante de l\'agent pour s\'en souvenir lors des futures sessions.',
      category: 'filesystem',
      parameters: {
        type: 'object',
        properties: {
          fact: { type: 'string', description: 'Le fait ou la règle à retenir de manière concise' },
        },
        required: ['fact'],
      },
      implementationKind: 'builtin',
      implementationConfig: { handler: 'memory_write' },
      classification: { isDestructive: true, runtimeProfile: 'worker' },
    }
  ],
  initialize: async () => {
    (globalThis as any).__forgePluginHandlers = (globalThis as any).__forgePluginHandlers || {};
    (globalThis as any).__forgePluginHandlers['memory_read'] = performMemoryRead;
    (globalThis as any).__forgePluginHandlers['memory_write'] = performMemoryWrite;
    await ensureMemoryFile();
  }
};

export default MemoryModule;
