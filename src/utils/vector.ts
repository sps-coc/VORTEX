import type { Vector2 } from '../simulation/types';

export function distance(firstVector: Vector2, secondVector: Vector2): number {
  const horizontalDelta: number = secondVector.x - firstVector.x;
  const verticalDelta: number = secondVector.y - firstVector.y;

  return Math.sqrt(horizontalDelta ** 2 + verticalDelta ** 2);
}

export function add(firstVector: Vector2, secondVector: Vector2): Vector2 {
  return {
    x: firstVector.x + secondVector.x,
    y: firstVector.y + secondVector.y,
  };
}

export function scale(vector: Vector2, scalar: number): Vector2 {
  return {
    x: scalar * vector.x,
    y: scalar * vector.y,
  };
}

export function normalize(vector: Vector2): Vector2 {
  const vectorMagnitude: number = Math.sqrt(vector.x ** 2 + vector.y ** 2);

  if (vectorMagnitude === 0) {
    return { x: 0, y: 0 };
  }

  return {
    x: vector.x / vectorMagnitude,
    y: vector.y / vectorMagnitude,
  };
}

export function subtract(firstVector: Vector2, secondVector: Vector2): Vector2 {
  return {
    x: firstVector.x - secondVector.x,
    y: firstVector.y - secondVector.y,
  };
}

export function magnitude(vector: Vector2): number {
  return Math.sqrt(vector.x ** 2 + vector.y ** 2);
}
