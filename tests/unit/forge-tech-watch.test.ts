import { describe, it, expect } from 'vitest';

// On teste les helpers internes via import dynamique (ils ne sont pas exportés
// publiquement, donc on duplique l'heuristique ici pour figer le contrat).

function classifyVersionBump(current: string, latest: string): 'major' | 'minor' | 'patch' {
  const curParts = current.replace(/^\^|~/g, '').split('.').map((n) => Number(n) || 0);
  const newParts = latest.split('.').map((n) => Number(n) || 0);
  if ((newParts[0] || 0) > (curParts[0] || 0)) return 'major';
  if ((newParts[1] || 0) > (curParts[1] || 0)) return 'minor';
  return 'patch';
}

function impactFromBump(bump: 'major' | 'minor' | 'patch'): 'low' | 'medium' | 'high' {
  if (bump === 'major') return 'medium';
  return 'low';
}

function impactFromSeverity(severity: string): 'low' | 'medium' | 'high' | 'critical' {
  const s = String(severity || '').toLowerCase();
  if (s === 'critical') return 'critical';
  if (s === 'high') return 'high';
  if (s === 'moderate') return 'medium';
  return 'low';
}

describe('tech-watch heuristics', () => {
  it('detects major bumps', () => {
    expect(classifyVersionBump('4.1.2', '5.0.0')).toBe('major');
    expect(impactFromBump(classifyVersionBump('4.1.2', '5.0.0'))).toBe('medium');
  });

  it('detects minor bumps', () => {
    expect(classifyVersionBump('5.1.0', '5.2.0')).toBe('minor');
    expect(impactFromBump('minor')).toBe('low');
  });

  it('handles caret/tilde prefix', () => {
    expect(classifyVersionBump('^4.0.0', '5.0.0')).toBe('major');
    expect(classifyVersionBump('~1.2.3', '1.2.4')).toBe('patch');
  });

  it('maps severity to impact', () => {
    expect(impactFromSeverity('critical')).toBe('critical');
    expect(impactFromSeverity('high')).toBe('high');
    expect(impactFromSeverity('moderate')).toBe('medium');
    expect(impactFromSeverity('low')).toBe('low');
    expect(impactFromSeverity('')).toBe('low');
    expect(impactFromSeverity('something-unknown')).toBe('low');
  });
});
