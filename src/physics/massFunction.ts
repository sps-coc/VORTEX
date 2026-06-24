import type { SimulationConfig } from '../simulation/types';

/**
 * Constant mass: M(v) = M₀.
 * No flux; horizon is static.
 */
export function constantMass(initialMass: number): number {
  return initialMass;
}

/**
 * Linear mass: M(v) = M₀ + a·v.
 * Steady infalling flux L = a = growthRate ≥ 0.
 */
export function linearMass(
  initialMass: number,
  growthRate: number,
  v: number,
): number {
  return initialMass + growthRate * v;
}

/**
 * Smooth-pulse mass (tanh step):
 *   M(v) = M₀ + ΔM · ½ · (1 + tanh((v - center) / width))
 *
 * - Before the pulse (v « center): M ≈ M₀
 * - At the pulse center:           M = M₀ + ΔM/2
 * - After the pulse (v » center):  M ≈ M₀ + ΔM  (permanent)
 *
 * dM/dv = ΔM · (1/2w) · sech²((v - center)/w) ≥ 0 when ΔM ≥ 0.
 * Satisfies the Vaidya energy condition (mass non-decreasing).
 */
export function smoothPulseMass(
  initialMass: number,
  deltaMass: number,
  center: number,
  width: number,
  v: number,
): number {
  return initialMass + deltaMass * 0.5 * (1 + Math.tanh((v - center) / width));
}

/**
 * Evaluate the analytic mass function at advanced time v.
 *
 * Throws for 'packet-driven' — that mode's mass is owned by Simulation
 * (it accumulates absorbed packet energies) and cannot be derived from v alone.
 */
export function evaluateMassFunction(config: SimulationConfig, v: number): number {
  switch (config.massFunctionMode) {
    case 'constant':
      return constantMass(config.initialMass);
    case 'linear':
      return linearMass(config.initialMass, config.linearGrowthRate, v);
    case 'smooth-pulse':
      return smoothPulseMass(
        config.initialMass,
        config.pulseDeltaMass,
        config.pulseCenter,
        config.pulseWidth,
        v,
      );
    case 'packet-driven':
      throw new Error(
        'evaluateMassFunction: packet-driven mass is stateful — use Simulation.update() instead',
      );
  }
}
