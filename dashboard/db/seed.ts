import { db, Project, AppData, Heartbeat, AgentTask, AgentMessage } from 'astro:db';

export default async function seed() {
  const existingProjects = await db.select().from(Project);
  if (existingProjects.length > 0) {
    console.log('Database already has data, skipping seed.');
    return;
  }

  console.log('Seeding database...');
  try {
    await db.insert(Project).values([
      { name: 'Tesla', path: '/mnt/GitHub/tesla', status: 'active' },
      { name: 'ZimaOS-MCP', path: '/mnt/GitHub/ZimaOS-MCP', status: 'active' },
      { name: 'MCP-Turso', path: '/mnt/GitHub/mcp-turso', status: 'active' },
      { name: 'Popcorn', path: '/mnt/GitHub/popcorn', status: 'dev' },
    ]);

    await db.insert(AppData).values([
      { appName: 'OpenClaw', composePath: '/mnt/Docker/yaml/casaos.yaml', dataDir: '/mnt/Docker/AppData/OpenClaw', status: 'running' },
    ]);

    await db.insert(Heartbeat).values([
      { level: 'info', message: 'Forge initialized with Astro DB', source: 'CHEF_TECHNIQUE' },
    ]);

    await db.insert(AgentMessage).values([
      { fromAgent: 'CHEF_TECHNIQUE', content: 'Base de données de communication activée.' },
    ]);

    console.log('Seeding completed successfully');
  } catch (e) {
    console.error('Seeding failed:', e);
  }
}
