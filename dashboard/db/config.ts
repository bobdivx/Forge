import { defineDb, defineTable, column } from 'astro:db';

const Project = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    name: column.text(),
    description: column.text({ optional: true }),
    path: column.text(),
    status: column.text({ default: 'active' }),
    createdAt: column.date({ default: new Date() }),
    updatedAt: column.date({ default: new Date() }),
  },
});

const AppData = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    appName: column.text(),
    composePath: column.text(),
    dataDir: column.text(),
    status: column.text(),
    lastBackup: column.date({ optional: true }),
  },
});

const Heartbeat = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    timestamp: column.date({ default: new Date() }),
    level: column.text(),
    message: column.text(),
    source: column.text(),
  },
});

const AgentTask = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    agentId: column.text(),
    task: column.text(),
    input: column.text({ optional: true }),
    output: column.text({ optional: true }),
    status: column.text({ default: 'pending' }),
    createdAt: column.date({ default: new Date() }),
    updatedAt: column.date({ default: new Date() }),
  },
});

const AgentMessage = defineTable({
  columns: {
    id: column.number({ primaryKey: true }),
    fromAgent: column.text(),
    toAgent: column.text({ optional: true }),
    content: column.text(),
    timestamp: column.date({ default: new Date() }),
  },
});

export default defineDb({
  tables: { Project, AppData, Heartbeat, AgentTask, AgentMessage }
});
