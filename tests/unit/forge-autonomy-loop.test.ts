import { describe, it, expect } from 'vitest';
import { isInQuietHours } from '../../src/lib/forge-autonomy-loop';

function at(h: number, m: number = 0): Date {
  const d = new Date(2026, 0, 15, h, m, 0);
  return d;
}

describe('isInQuietHours', () => {
  it('return false sans range', () => {
    expect(isInQuietHours(at(3), '')).toBe(false);
    expect(isInQuietHours(at(3), undefined)).toBe(false);
    expect(isInQuietHours(at(3), null)).toBe(false);
  });

  it('return false avec range invalide', () => {
    expect(isInQuietHours(at(3), 'invalid')).toBe(false);
    expect(isInQuietHours(at(3), '99:99-10:00')).toBe(false);
    expect(isInQuietHours(at(3), '22:00')).toBe(false);
    expect(isInQuietHours(at(3), '22:00-22:00')).toBe(false);
  });

  it('plage simple (ne traverse pas minuit)', () => {
    expect(isInQuietHours(at(10), '09:00-12:00')).toBe(true);
    expect(isInQuietHours(at(8, 59), '09:00-12:00')).toBe(false);
    expect(isInQuietHours(at(9, 0), '09:00-12:00')).toBe(true);
    expect(isInQuietHours(at(12, 0), '09:00-12:00')).toBe(false);
    expect(isInQuietHours(at(11, 59), '09:00-12:00')).toBe(true);
  });

  it('plage qui traverse minuit', () => {
    expect(isInQuietHours(at(23), '22:00-07:00')).toBe(true);
    expect(isInQuietHours(at(3), '22:00-07:00')).toBe(true);
    expect(isInQuietHours(at(6, 59), '22:00-07:00')).toBe(true);
    expect(isInQuietHours(at(7, 0), '22:00-07:00')).toBe(false);
    expect(isInQuietHours(at(21, 59), '22:00-07:00')).toBe(false);
    expect(isInQuietHours(at(22, 0), '22:00-07:00')).toBe(true);
  });
});
