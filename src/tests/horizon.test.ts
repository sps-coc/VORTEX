import { describe, expect, it } from 'vitest';
import { apparentHorizonRadiusFromMass } from '../physics/horizon';

describe('apparentHorizonRadiusFromMass', () => {
  it('returns 0 for mass 0', () => {
    expect(apparentHorizonRadiusFromMass(0)).toBe(0);
  });

  it('returns 2M for mass 1', () => {
    expect(apparentHorizonRadiusFromMass(1)).toBe(2);
  });

  it('returns 2M for mass 5', () => {
    expect(apparentHorizonRadiusFromMass(5)).toBe(10);
  });

  it('returns 2M for fractional mass', () => {
    expect(apparentHorizonRadiusFromMass(0.5)).toBe(1);
  });

  it('throws for negative mass', () => {
    expect(() => apparentHorizonRadiusFromMass(-1)).toThrow();
  });

  it('throws for NaN mass', () => {
    expect(() => apparentHorizonRadiusFromMass(NaN)).toThrow();
  });
});
