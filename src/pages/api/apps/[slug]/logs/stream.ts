import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ params }) => {
  const { slug } = params;

  if (!slug) {
    return new Response('Application non trouvée', { status: 404 });
  }

  const stream = new ReadableStream({
    start(controller) {
      let counter = 0;
      const interval = setInterval(() => {
        counter++;
        const log = `data: [${new Date().toISOString()}] INFO  Log message #${counter} for ${slug}\n\n`;
        controller.enqueue(new TextEncoder().encode(log));

        if (counter >= 50) {
          clearInterval(interval);
          controller.close();
        }
      }, 2000);

      return () => clearInterval(interval);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
};
