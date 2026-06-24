import { describe, expect, it } from 'vitest';
import {
  constantMass,
  linearMass,
  smoothPulseMass,
  evaluateMassFunction,
} from '../physics/massFunction';
import type { SimulationConfig } from '../simulation/types';

describe('constantMass', () => {
  it('always returns the initial mass regardless of time', () => {
    expect(constantMass(5)).toBe(5);
    expect(constantMass(5)).toBe(5); // same at any v
  });

  it('returns 0 for initial mass 0', () => {
    expect(constantMass(0)).toBe(0);
  });
});

describe('linearMass', () => {
  it('returns M0 at v = 0', () => {
    expect(linearMass(2, 0.1, 0)).toBe(2);
  });

  it('grows at the specified rate', () => {
    expect(linearMass(1, 0.5, 4)).toBeCloseTo(3);
  });

  it('returns M0 when growthRate is 0', () => {
    expect(linearMass(3, 0, 100)).toBe(3);
  });

  it('matches M0 + a*v for several values', () => {
    const M0 = 2;
    const a = 0.1;
    for (const v of [0, 1, 5, 10, 50]) {
      expect(linearMass(M0, a, v)).toBeCloseTo(M0 + a * v);
    }
  });
});

describe('smoothPulseMass', () => {
  const M0 = 1;
  const dM = 2;
  const center = 10;
  const width = 2;

  it('equals M0 + ΔM/2 at the center', () => {
    // tanh(0) = 0 exactly → M0 + ΔM * 0.5 * 1 = M0 + ΔM/2
    expect(smoothPulseMass(M0, dM, center, width, center)).toBe(M0 + dM / 2);
  });

  it('approaches M0 well before the pulse', () => {
    // v = center - 10*width = -10 — many widths before the pulse
    expect(smoothPulseMass(M0, dM, center, width, center - 10 * width)).toBeCloseTo(M0, 4);
  });

  it('approaches M0 + ΔM well after the pulse', () => {
    // v = center + 10*width — many widths after the pulse
    expect(smoothPulseMass(M0, dM, center, width, center + 10 * width)).toBeCloseTo(
      M0 + dM,
      4,
    );
  });

  it('is monotonically non-decreasing (energy condition satisfied)', () => {
    let prev = -Infinity;
    for (let v = -10; v <= 30; v += 0.5) {
      const m = smoothPulseMass(M0, dM, center, width, v);
      expect(m).toBeGreaterThanOrEqual(prev);
      prev = m;
    }
  });

  it('stays at M0 for ΔM = 0 (no pulse)', () => {
    for (const v of [0, 5, 10, 20]) {
      expect(smoothPulseMass(M0, 0, center, width, v)).toBeCloseTo(M0);
    }
  });
});

describe('evaluateMassFunction', () => {
  const base: SimulationConfig = {
    initialMass: 2,
    massFunctionMode: 'constant',
    linearGrowthRate: 0.5,
    pulseDeltaMass: 3,
    pulseCenter: 10,
    pulseWidth: 2,
    packetEnergy: 0.01,
    packetSpawnRate: 5,
    packetSpeed: 1,
    spawnRadius: 12,
    timeScale: 1,
    maxPackets: 100,
  };

  it('dispatches constant mode correctly', () => {
    expect(evaluateMassFunction({ ...base, massFunctionMode: 'constant' }, 100)).toBe(2);
  });

  it('dispatches linear mode correctly', () => {
    expect(evaluateMassFunction({ ...base, massFunctionMode: 'linear' }, 4)).toBeCloseTo(
      2 + 0.5 * 4,
    );
  });

  it('dispatches smooth-pulse mode correctly', () => {
    const result = evaluateMassFunction({ ...base, massFunctionMode: 'smooth-pulse' }, 10);
    // At center: M0 + ΔM/2 = 2 + 3/2 = 3.5
    expect(result).toBeCloseTo(3.5);
  });

  it('throws for packet-driven mode', () => {
    expect(() =>
      evaluateMassFunction({ ...base, massFunctionMode: 'packet-driven' }, 0),
    ).toThrow();
  });
});
