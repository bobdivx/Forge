import { db, Config, OllamaInstance, eq } from 'astro:db';

export default async function () {
  console.log('Seeding existing Ollama instances...');
  
  // 1. Get the current ollamaUrl from config
  const rows = await db.select().from(Config).where(eq(Config.key, 'ollamaUrl'));
  const currentUrl = rows.length > 0 ? rows[0].value.trim() : '';

  // 2. Add some defaults if the list is empty
  const instances = await db.select().from(OllamaInstance);
  if (instances.length === 0) {
    if (currentUrl) {
      await db.insert(OllamaInstance).values({
        name: 'Instance principale (ZimaOS)',
        url: currentUrl.replace(/\/$/, ''),
        apiKey: '', // Par défaut vide
        enabled: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`Added current instance: ${currentUrl}`);
    }
    
    // Add the known secondary instances as disabled by default
    const fallbacks = [
        { name: 'Ollama NAS (Briseteia)', url: 'https://ollamanas.briseteia.me' },
        { name: 'Ollama Windows (Briseteia)', url: 'https://ollama.briseteia.me' }
    ];
    
    for (const fb of fallbacks) {
        if (fb.url !== currentUrl) {
            await db.insert(OllamaInstance).values({
                name: fb.name,
                url: fb.url,
                enabled: 0, // Disabled by default to avoid noise
                createdAt: new Date(),
                updatedAt: new Date(),
            });
        }
    }
  }
  
  console.log('Seeding complete.');
}
