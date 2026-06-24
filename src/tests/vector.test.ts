import { describe, expect, it } from 'vitest';
import {
  distance,
  add,
  scale,
  normalize,
  subtract,
  magnitude,
} from '../utils/vector';

describe('distance', () => {
  it('returns 0 for identical vectors', () => {
    expect(distance({ x: 3, y: 4 }, { x: 3, y: 4 })).toBe(0);
  });

  it('returns correct distance for a 3-4-5 triangle', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('is symmetric', () => {
    expect(distance({ x: 1, y: 2 }, { x: 4, y: 6 })).toBeCloseTo(
      distance({ x: 4, y: 6 }, { x: 1, y: 2 }),
    );
  });
});

describe('add', () => {
  it('adds two vectors', () => {
    expect(add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
  });

  it('handles negative components', () => {
    expect(add({ x: -1, y: 3 }, { x: 1, y: -3 })).toEqual({ x: 0, y: 0 });
  });
});

describe('scale', () => {
  it('scales by a positive scalar', () => {
    expect(scale({ x: 2, y: 3 }, 2)).toEqual({ x: 4, y: 6 });
  });

  it('scales by zero produces zero vector', () => {
    expect(scale({ x: 5, y: 7 }, 0)).toEqual({ x: 0, y: 0 });
  });

  it('scales by negative scalar', () => {
    expect(scale({ x: 1, y: -1 }, -3)).toEqual({ x: -3, y: 3 });
  });
});

describe('normalize', () => {
  it('produces a unit vector', () => {
    const normalizedVector = normalize({ x: 3, y: 4 });
    expect(
      Math.sqrt(normalizedVector.x ** 2 + normalizedVector.y ** 2),
    ).toBeCloseTo(1);
  });

  it('returns (0,0) for the zero vector', () => {
    expect(normalize({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('returns the same direction for an already-unit vector', () => {
    const normalizedVector = normalize({ x: 1, y: 0 });
    expect(normalizedVector.x).toBeCloseTo(1);
    expect(normalizedVector.y).toBeCloseTo(0);
  });
});

describe('subtract', () => {
  it('subtracts two vectors', () => {
    expect(subtract({ x: 5, y: 7 }, { x: 2, y: 3 })).toEqual({ x: 3, y: 4 });
  });

  it('gives zero vector when subtracting itself', () => {
    expect(subtract({ x: 3, y: 4 }, { x: 3, y: 4 })).toEqual({ x: 0, y: 0 });
  });

  it('handles negative components', () => {
    expect(subtract({ x: 1, y: -1 }, { x: -1, y: 1 })).toEqual({ x: 2, y: -2 });
  });
});

describe('magnitude', () => {
  it('returns 0 for zero vector', () => {
    expect(magnitude({ x: 0, y: 0 })).toBe(0);
  });

  it('returns correct magnitude for 3-4-5', () => {
    expect(magnitude({ x: 3, y: 4 })).toBe(5);
  });

  it('returns correct magnitude for a unit vector', () => {
    expect(magnitude({ x: 1, y: 0 })).toBe(1);
  });
});
