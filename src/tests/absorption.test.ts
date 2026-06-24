import { describe, expect, it } from 'vitest';
import { isAbsorbed } from '../physics/absorption';

describe('isAbsorbed', () => {
  const bhPos = { x: 0, y: 0 };
  const horizonRadius = 2;

  it('returns true when the packet is inside the horizon', () => {
    expect(isAbsorbed({ x: 1, y: 0 }, bhPos, horizonRadius)).toBe(true);
  });

  it('returns true when the packet is exactly on the horizon (boundary inclusive)', () => {
    expect(isAbsorbed({ x: 2, y: 0 }, bhPos, horizonRadius)).toBe(true);
  });

  it('returns false when the packet is outside the horizon', () => {
    expect(isAbsorbed({ x: 3, y: 0 }, bhPos, horizonRadius)).toBe(false);
  });

  it('works correctly with a non-origin black hole position', () => {
    const offset = { x: 5, y: 5 };
    // Packet at (6,5) is 1 unit from (5,5) — inside horizon of radius 2
    expect(isAbsorbed({ x: 6, y: 5 }, offset, horizonRadius)).toBe(true);
    // Packet at (8,5) is 3 units from (5,5) — outside
    expect(isAbsorbed({ x: 8, y: 5 }, offset, horizonRadius)).toBe(false);
  });

  it('returns false when horizonRadius is 0 and packet is not at the center', () => {
    expect(isAbsorbed({ x: 0.001, y: 0 }, bhPos, 0)).toBe(false);
  });

  it('uses 3-4-5 distance correctly', () => {
    // distance from (3,4) to origin = 5 > radius 4 → not absorbed
    expect(isAbsorbed({ x: 3, y: 4 }, bhPos, 4)).toBe(false);
    // distance = 5, radius = 5 → absorbed (on boundary)
    expect(isAbsorbed({ x: 3, y: 4 }, bhPos, 5)).toBe(true);
  });
});
