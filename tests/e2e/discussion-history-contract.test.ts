import { describe, expect, it } from 'vitest';
import { POST } from '../../src/pages/api/discussion-history';

describe('/api/discussion-history', () => {
  it('retourne 401 sans session utilisateur', async () => {
    const req = new Request('http://localhost/api/discussion-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionKey: 's1' }),
    });
    const res = await POST({ request: req, locals: {} } as any);
    expect(res.status).toBe(401);
  });

  it('retourne 400 si sessionKey absent', async () => {
    const req = new Request('http://localhost/api/discussion-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await POST({ request: req, locals: { user: { email: 'x@y.z' } } } as any);
    expect(res.status).toBe(400);
  });
});

