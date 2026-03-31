import type { APIRoute } from 'astro';
import fs from 'fs';
import path from 'path';

const CONFIG_PATH = '/media/Github/Forge/instructions/config.json';

export const GET: APIRoute = async () => {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      return new Response(JSON.stringify({}), { status: 200 });
    }
    const data = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return new Response(data, { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Impossible de lire la config" }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const data = await request.json();
    
    // Ensure dir exists
    const dir = path.dirname(CONFIG_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(CONFIG_PATH, JSON.stringify(data, null, 2));
    
    return new Response(JSON.stringify({ status: 'success' }), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Échec de sauvegarde" }), { status: 500 });
  }
};
