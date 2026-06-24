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
    const initialMassValue = 2;
    const growthRate = 0.1;
    for (const advancedTime of [0, 1, 5, 10, 50]) {
      expect(
        linearMass(initialMassValue, growthRate, advancedTime),
      ).toBeCloseTo(initialMassValue + growthRate * advancedTime);
    }
  });
});

describe('smoothPulseMass', () => {
  const initialMassValue = 1;
  const deltaMassValue = 2;
  const center = 10;
  const width = 2;

  it('equals M0 + ΔM/2 at the center', () => {
    // tanh(0) = 0 exactly → M0 + ΔM * 0.5 * 1 = M0 + ΔM/2
    expect(
      smoothPulseMass(initialMassValue, deltaMassValue, center, width, center),
    ).toBe(initialMassValue + deltaMassValue / 2);
  });

  it('approaches M0 well before the pulse', () => {
    // v = center - 10*width — many widths before the pulse
    expect(
      smoothPulseMass(
        initialMassValue,
        deltaMassValue,
        center,
        width,
        center - 10 * width,
      ),
    ).toBeCloseTo(initialMassValue, 4);
  });

  it('approaches M0 + ΔM well after the pulse', () => {
    // v = center + 10*width — many widths after the pulse
    expect(
      smoothPulseMass(
        initialMassValue,
        deltaMassValue,
        center,
        width,
        center + 10 * width,
      ),
    ).toBeCloseTo(initialMassValue + deltaMassValue, 4);
  });

  it('is monotonically non-decreasing (energy condition satisfied)', () => {
    let previousMassValue = -Infinity;
    for (let advancedTime = -10; advancedTime <= 30; advancedTime += 0.5) {
      const computedMass = smoothPulseMass(
        initialMassValue,
        deltaMassValue,
        center,
        width,
        advancedTime,
      );
      expect(computedMass).toBeGreaterThanOrEqual(previousMassValue);
      previousMassValue = computedMass;
    }
  });

  it('stays at M0 for ΔM = 0 (no pulse)', () => {
    for (const advancedTime of [0, 5, 10, 20]) {
      expect(
        smoothPulseMass(initialMassValue, 0, center, width, advancedTime),
      ).toBeCloseTo(initialMassValue);
    }
  });
});

describe('evaluateMassFunction', () => {
  const baseConfig: SimulationConfig = {
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
    expect(
      evaluateMassFunction(
        { ...baseConfig, massFunctionMode: 'constant' },
        100,
      ),
    ).toBe(2);
  });

  it('dispatches linear mode correctly', () => {
    expect(
      evaluateMassFunction({ ...baseConfig, massFunctionMode: 'linear' }, 4),
    ).toBeCloseTo(2 + 0.5 * 4);
  });

  it('dispatches smooth-pulse mode correctly', () => {
    const computedMass = evaluateMassFunction(
      { ...baseConfig, massFunctionMode: 'smooth-pulse' },
      10,
    );
    // At center: M0 + ΔM/2 = 2 + 3/2 = 3.5
    expect(computedMass).toBeCloseTo(3.5);
  });

  it('throws for packet-driven mode', () => {
    expect(() =>
      evaluateMassFunction(
        { ...baseConfig, massFunctionMode: 'packet-driven' },
        0,
      ),
    ).toThrow();
  });
});
