import { db, Project } from 'astro:db';
import fs from 'fs';

export default async function seed() {
  console.log('Syncing projects from /mnt/GitHub/ to Astro DB...');
  const paths = [
    { name: 'Tesla', path: '/mnt/GitHub/tesla' },
    { name: 'Popcorn', path: '/mnt/GitHub/popcorn' },
    { name: 'Forge', path: '/mnt/GitHub/Forge' },
    { name: 'mcp-turso', path: '/mnt/GitHub/mcp-turso' },
    { name: 'ZimaOS-MCP', path: '/mnt/GitHub/ZimaOS-MCP' },
  ];

  for (const p of paths) {
    if (fs.existsSync(p.path)) {
      try {
        await db.insert(Project).values({
          name: p.name,
          path: p.path,
          status: 'active',
          description: 'Projet synchronisé depuis le NAS'
        });
        console.log(`+ Added ${p.name}`);
      } catch (e) {
        console.log(`! Skip ${p.name} (already exists or error)`);
      }
    }
  }
}
