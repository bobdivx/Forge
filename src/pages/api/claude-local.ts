import type { APIRoute } from 'astro';
import { spawn } from 'child_process';

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const prompt = body.prompt || '';
    const cwd = body.cwd || process.cwd();
    const model = body.model; // Le modèle sélectionné dans l'interface

    if (!prompt) {
      return new Response(JSON.stringify({ error: "Le champ 'prompt' est requis." }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const stream = new ReadableStream({
      start(controller) {
        // Préparer les variables d'environnement en injectant le modèle choisi
        const env: NodeJS.ProcessEnv = { ...process.env, CI: "true", FORCE_COLOR: "1" };
        if (model) {
          env.OLLAMA_MODEL = model;
        }

        const claudeProcess = spawn('bash', ['./scripts/launch-claude-local.sh', '-p', prompt], {
          cwd,
          env
        });

        claudeProcess.stdout.on('data', (data) => {
          controller.enqueue(data);
        });

        claudeProcess.stderr.on('data', (data) => {
          controller.enqueue(data);
        });

        claudeProcess.on('close', (code) => {
          controller.enqueue(new TextEncoder().encode(`\n[Processus terminé avec le code ${code}]`));
          controller.close();
        });

        claudeProcess.on('error', (err) => {
          controller.enqueue(new TextEncoder().encode(`\n[Erreur de lancement: ${err.message}]`));
          controller.close();
        });
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
