import type { Vector2 } from '../simulation/types';
import { distance } from '../utils/vector';

/**
 * Returns true when an energy packet has crossed the apparent horizon.
 *
 * Absorption condition: |packetPosition − blackHolePosition| ≤ horizonRadius
 */
export function isAbsorbed(
  packetPosition: Vector2,
  blackHolePosition: Vector2,
  horizonRadius: number,
): boolean {
  return distance(packetPosition, blackHolePosition) <= horizonRadius;
}
