import { db, Config, eq } from 'astro:db';

export default async function () {
  console.log('Applying real ZimaCube configuration...');
  
  const updates = [
    { key: 'zimaosGatewayUrl', value: 'http://10.1.0.58:18789' },
    { key: 'zimaosRuntimeUrl', value: 'http://10.1.0.58:18789' },
    { key: 'zimaosContainerName', value: 'openclaw' },
    { key: 'forgeReposRoot', value: '/media/GitHub' },
    { key: 'forgeReposRootAgent', value: '/mnt/GitHub' },
    { key: 'zimaosAccessMode', value: 'remote_ssh' },
    { key: 'zimaosHost', value: '10.1.0.58' },
    { key: 'zimaosSshUser', value: 'bobdivx' }
  ];

  for (const item of updates) {
    const existing = await db.select().from(Config).where(eq(Config.key, item.key));
    if (!existing.length) {
      await db.insert(Config).values({ key: item.key, value: item.value, updatedAt: new Date() });
    } else {
      await db.update(Config).set({ value: item.value, updatedAt: new Date() }).where(eq(Config.key, item.key));
    }
  }
  
  console.log('Configuration applied successfully.');
}
