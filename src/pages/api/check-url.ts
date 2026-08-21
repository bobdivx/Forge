import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return new Response(JSON.stringify({ reachable: false, error: 'No URL provided' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(targetUrl, {
      method: 'HEAD',
      signal: controller.signal,
      redirect: 'follow',
    });

    clearTimeout(timeoutId);

    const reachable = response.ok || response.status < 500;
    
    return new Response(JSON.stringify({ 
      reachable, 
      status: response.status,
      statusText: response.statusText,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ 
      reachable: false, 
      error: error.message || 'Connection failed',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
