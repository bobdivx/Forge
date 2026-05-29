import type { ForgePlugin } from '../src/lib/forge-plugin-loader';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

const todoFile = join(process.cwd(), 'TODO.md');

async function ensureTodoFile() {
  if (!existsSync(todoFile)) {
    await writeFile(todoFile, '# Project TODOs\n\n- [ ] Initial task\n', 'utf-8');
  }
}

async function performTodoAdd(args: { task: string }): Promise<string> {
  await ensureTodoFile();
  try {
    const data = await readFile(todoFile, 'utf-8');
    const newData = data.trim() + `\n- [ ] ${args.task}\n`;
    await writeFile(todoFile, newData, 'utf-8');
    return `Task added: "${args.task}"`;
  } catch (err: any) {
    return `Error adding task: ${err.message}`;
  }
}

async function performTodoList(): Promise<string> {
  await ensureTodoFile();
  try {
    const data = await readFile(todoFile, 'utf-8');
    return data;
  } catch (err: any) {
    return `Error reading TODO list: ${err.message}`;
  }
}

async function performTodoUpdate(args: { taskLineIndex: number; status: 'todo' | 'in_progress' | 'done' }): Promise<string> {
  await ensureTodoFile();
  try {
    const data = await readFile(todoFile, 'utf-8');
    const lines = data.split('\n');
    let checkboxCount = 0;
    let found = false;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().match(/^- \[[ x/\]]/i)) {
        checkboxCount++;
        if (checkboxCount === args.taskLineIndex) {
          const marker = args.status === 'done' ? '[x]' : args.status === 'in_progress' ? '[/]' : '[ ]';
          lines[i] = lines[i].replace(/\[[ x/\]]/i, marker);
          found = true;
          break;
        }
      }
    }

    if (!found) {
      return `Task at index ${args.taskLineIndex} not found. Use todo_list to see indices (1-based).`;
    }

    await writeFile(todoFile, lines.join('\n'), 'utf-8');
    return `Task ${args.taskLineIndex} updated to ${args.status}.`;
  } catch (err: any) {
    return `Error updating task: ${err.message}`;
  }
}

const KanbanModule: ForgePlugin = {
  name: 'module-kanban',
  version: '1.0.0',
  tools: [
    {
      name: 'todo_add',
      displayName: 'Ajouter une tâche',
      description: 'Ajoute une nouvelle tâche à la TODO liste du projet (TODO.md).',
      category: 'filesystem',
      parameters: {
        type: 'object',
        properties: {
          task: { type: 'string', description: 'Description de la tâche' },
        },
        required: ['task'],
      },
      implementationKind: 'builtin',
      implementationConfig: { handler: 'todo_add' },
      classification: { isDestructive: true, runtimeProfile: 'worker' },
    },
    {
      name: 'todo_list',
      displayName: 'Lister les tâches',
      description: 'Affiche le contenu de la TODO liste du projet.',
      category: 'filesystem',
      parameters: {
        type: 'object',
        properties: {},
      },
      implementationKind: 'builtin',
      implementationConfig: { handler: 'todo_list' },
      classification: { isReadOnly: true, isConcurrencySafe: true, runtimeProfile: 'both' },
    },
    {
      name: 'todo_update',
      displayName: 'Mettre à jour une tâche',
      description: 'Change le statut d\'une tâche existante dans la TODO liste.',
      category: 'filesystem',
      parameters: {
        type: 'object',
        properties: {
          taskLineIndex: { type: 'integer', description: 'Index (1-based) de la tâche parmi les lignes à puces.' },
          status: { type: 'string', enum: ['todo', 'in_progress', 'done'], description: 'Nouveau statut.' }
        },
        required: ['taskLineIndex', 'status'],
      },
      implementationKind: 'builtin',
      implementationConfig: { handler: 'todo_update' },
      classification: { isDestructive: true, runtimeProfile: 'worker' },
    }
  ],
  initialize: async () => {
    (globalThis as any).__forgePluginHandlers = (globalThis as any).__forgePluginHandlers || {};
    (globalThis as any).__forgePluginHandlers['todo_add'] = performTodoAdd;
    (globalThis as any).__forgePluginHandlers['todo_list'] = performTodoList;
    (globalThis as any).__forgePluginHandlers['todo_update'] = performTodoUpdate;
    await ensureTodoFile();
  }
};

export default KanbanModule;
