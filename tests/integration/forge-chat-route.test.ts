import { describe, expect, it } from 'vitest';
import { POST } from '../../src/pages/api/forge-chat';

describe('/api/forge-chat', () => {
  it('retourne 401 sans utilisateur authentifié', async () => {
    const req = new Request('http://localhost/api/forge-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 's1', agentId: 'a1', message: 'hello' }),
    });
    const res = await POST({ request: req, locals: {} } as any);
    expect(res.status).toBe(401);
  });

  it('retourne 400 si payload incomplet', async () => {
    const req = new Request('http://localhost/api/forge-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await POST({ request: req, locals: { user: { email: 'x@y.z' } } } as any);
    expect(res.status).toBe(400);
  });
});

