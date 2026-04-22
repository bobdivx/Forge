import type { APIRoute } from 'astro';
import { getAppUpdateInfo } from '../../lib/app-update-check';

export const GET: APIRoute = async ({ url }) => {
  const force = ['1', 'true', 'yes'].includes(String(url.searchParams.get('force') || '').toLowerCase());
  const data = await getAppUpdateInfo({ force });
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
