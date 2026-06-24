import { describe, expect, it } from 'vitest';
import { VaidyaBlackHole } from '../simulation/VaidyaBlackHole';

describe('VaidyaBlackHole constructor', () => {
  it('creates a black hole with the given mass and position', () => {
    const bh = new VaidyaBlackHole(3, { x: 1, y: 2 });
    expect(bh.getMass()).toBe(3);
    expect(bh.getPosition()).toEqual({ x: 1, y: 2 });
  });

  it('accepts mass 0', () => {
    const bh = new VaidyaBlackHole(0, { x: 0, y: 0 });
    expect(bh.getMass()).toBe(0);
  });

  it('throws for negative mass', () => {
    expect(() => new VaidyaBlackHole(-1, { x: 0, y: 0 })).toThrow();
  });
});

describe('VaidyaBlackHole.setMass', () => {
  it('updates the mass', () => {
    const bh = new VaidyaBlackHole(1, { x: 0, y: 0 });
    bh.setMass(5);
    expect(bh.getMass()).toBe(5);
  });

  it('throws for negative mass', () => {
    const bh = new VaidyaBlackHole(1, { x: 0, y: 0 });
    expect(() => bh.setMass(-1)).toThrow();
  });

  it('throws for NaN', () => {
    const bh = new VaidyaBlackHole(1, { x: 0, y: 0 });
    expect(() => bh.setMass(NaN)).toThrow();
  });
});

describe('VaidyaBlackHole.addMass', () => {
  it('adds a positive delta to the mass', () => {
    const bh = new VaidyaBlackHole(2, { x: 0, y: 0 });
    bh.addMass(0.5);
    expect(bh.getMass()).toBeCloseTo(2.5);
  });

  it('subtracts when delta is negative but result stays non-negative', () => {
    const bh = new VaidyaBlackHole(2, { x: 0, y: 0 });
    bh.addMass(-1);
    expect(bh.getMass()).toBeCloseTo(1);
  });

  it('throws when the resulting mass would be negative', () => {
    const bh = new VaidyaBlackHole(1, { x: 0, y: 0 });
    expect(() => bh.addMass(-2)).toThrow();
  });

  it('throws for NaN delta', () => {
    const bh = new VaidyaBlackHole(1, { x: 0, y: 0 });
    expect(() => bh.addMass(NaN)).toThrow();
  });
});

describe('VaidyaBlackHole.getApparentHorizonRadius', () => {
  it('returns 2M (the Vaidya apparent horizon formula in G=c=1 units)', () => {
    const bh = new VaidyaBlackHole(3, { x: 0, y: 0 });
    expect(bh.getApparentHorizonRadius()).toBe(6);
  });

  it('returns 0 when mass is 0', () => {
    const bh = new VaidyaBlackHole(0, { x: 0, y: 0 });
    expect(bh.getApparentHorizonRadius()).toBe(0);
  });
});

describe('VaidyaBlackHole.getPosition', () => {
  it('returns a copy of the position (not an internal reference)', () => {
    const bh = new VaidyaBlackHole(1, { x: 3, y: 4 });
    const pos = bh.getPosition();
    pos.x = 9999;
    expect(bh.getPosition().x).toBe(3);
  });
});

describe('VaidyaBlackHole.getState', () => {
  it('returns mass, position copy, and apparentHorizonRadius', () => {
    const bh = new VaidyaBlackHole(2, { x: 1, y: 0 });
    const state = bh.getState();
    expect(state.mass).toBe(2);
    expect(state.apparentHorizonRadius).toBe(4);
    expect(state.position).toEqual({ x: 1, y: 0 });
  });

  it('returns a position copy so mutating the snapshot does not affect the black hole', () => {
    const bh = new VaidyaBlackHole(1, { x: 5, y: 6 });
    const state = bh.getState();
    state.position.x = 9999;
    expect(bh.getPosition().x).toBe(5);
  });
});
