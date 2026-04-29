import { db, Config, eq } from 'astro:db';

export default async function () {
  console.log('Applying final Ollama configuration...');
  
  await db.update(Config).set({ value: 'http://10.1.0.58:38197', updatedAt: new Date() }).where(eq(Config.key, 'ollamaUrl'));
  
  console.log('Ollama configuration applied.');
}
