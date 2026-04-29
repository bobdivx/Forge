import { db, Config, eq } from 'astro:db';

export default async function () {
  console.log('Pre-filling ZimaOS native defaults...');
  
  const defaults = [
    { key: 'zimaosContainerName', value: 'zimaos' },
    { key: 'zimaosRuntimeUrl', value: 'http://172.17.0.1:24190' },
    { key: 'zimaosGatewayUrl', value: 'http://172.17.0.1:24190' },
    { key: 'zimaosSshUser', value: 'root' },
    { key: 'zimaosSshPort', value: '22' },
    { key: 'zimaosAccessMode', value: 'local_docker' }
  ];

  for (const item of defaults) {
    const existing = await db.select().from(Config).where(eq(Config.key, item.key));
    if (!existing.length || !existing[0].value.trim()) {
      console.log(`Setting default for ${item.key}: ${item.value}`);
      if (!existing.length) {
        await db.insert(Config).values({ key: item.key, value: item.value, updatedAt: new Date() });
      } else {
        await db.update(Config).set({ value: item.value, updatedAt: new Date() }).where(eq(Config.key, item.key));
      }
    } else {
      console.log(`${item.key} is already set to: ${existing[0].value}`);
    }
  }
  
  console.log('Pre-fill complete.');
}
