import { describe, expect, it } from 'vitest';
import { buildAgentTeamProfile } from '../../src/lib/agent-profile';

describe('agent-profile', () => {
  it('gère les champs absents sans crash', () => {
    const profile = buildAgentTeamProfile({
      id: 'a1',
      name: undefined as unknown as string,
      model: undefined as unknown as string,
      status: undefined as unknown as string,
    });
    expect(profile.displayName).toBeTruthy();
    expect(profile.role).toBeTruthy();
    expect(profile.presenceLabel).toBeTruthy();
  });
});

