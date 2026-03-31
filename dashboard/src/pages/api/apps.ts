import type { APIRoute } from 'astro';
import fs from 'fs';
import path from 'path';

export const GET: APIRoute = async () => {
  try {
    const githubPath = '/media/Github';
    
    if (!fs.existsSync(githubPath)) {
      return new Response(JSON.stringify({ error: "Chemin GitHub non trouvé" }), { 
        status: 404, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    const entries = fs.readdirSync(githubPath, { withFileTypes: true });
    const projects = entries
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
      .map(entry => {
        const projectPath = path.join(githubPath, entry.name);
        let lastModified = 0;
        try {
          lastModified = fs.statSync(projectPath).mtimeMs;
        } catch (e) {}
        
        return {
          name: entry.name,
          path: projectPath,
          lastModified
        };
      })
      .sort((a, b) => b.lastModified - a.lastModified);

    return new Response(JSON.stringify(projects), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Erreur lors du listage des applications" }), { 
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
