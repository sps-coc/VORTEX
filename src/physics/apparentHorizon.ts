import { evaluateOuterKerrRadius } from "./kerrVaidyaGeometry.ts";

export interface HorizonSample {
  theta: number;
  radius: number;
  correction: number;
}

export interface ApparentHorizonSolution {
  baseRadius: number;
  maximumCorrection: number;
  samples: HorizonSample[];
  packedRadii: Float32Array;
}

export const HorizonSampleCount = 64;

function coefficientA(baseRadius: number, spin: number): number {
  const r2 = baseRadius * baseRadius;
  const a2 = spin * spin;
  return 8 * r2 * Math.pow(a2 + r2, 2);
}

function coefficientB(theta: number, baseRadius: number, spin: number): number {
  const r2 = baseRadius * baseRadius;
  const a2 = spin * spin;
  const a4 = a2 * a2;
  const bracket = a4 + 7 * a2 * r2 + 8 * r2 * r2 + a2 * (r2 - a2) * Math.cos(2 * theta);

  return (r2 - a2) * bracket;
}

function sourceTerm(theta: number, baseRadius: number, spin: number, massDerivative: number): number {
  const r2 = baseRadius * baseRadius;
  const a2 = spin * spin;
  return 8 * Math.pow(baseRadius, 3) * a2 * (a2 + r2) * Math.sin(theta) ** 2 * massDerivative;
}

// Thomas algorithm: the finite-difference operator is tridiagonal, so the solve is
// O(n) instead of O(n^3) dense elimination — this runs every frame.
function solveTridiagonalSystem(
  lower: Float64Array,
  center: Float64Array,
  upper: Float64Array,
  source: Float64Array
): Float64Array {
  const n = source.length;
  const forwardUpper = new Float64Array(n);
  const forwardSource = new Float64Array(n);
  forwardUpper[0] = upper[0] / center[0];
  forwardSource[0] = source[0] / center[0];
  for (let row = 1; row < n; row += 1) {
    const pivot = center[row] - lower[row] * forwardUpper[row - 1];
    forwardUpper[row] = upper[row] / pivot;
    forwardSource[row] = (source[row] - lower[row] * forwardSource[row - 1]) / pivot;
  }
  const solution = new Float64Array(n);
  solution[n - 1] = forwardSource[n - 1];
  for (let row = n - 2; row >= 0; row -= 1) {
    solution[row] = forwardSource[row] - forwardUpper[row] * solution[row + 1];
  }
  return solution;
}

export function solveApparentHorizon(mass: number, spin: number, massDerivative: number): ApparentHorizonSolution {
  const baseRadius = evaluateOuterKerrRadius(mass, spin);
  const count = HorizonSampleCount;
  const interiorCount = count - 2;
  const step = Math.PI / (count - 1);

  if (Math.abs(spin) < 1e-5 || Math.abs(massDerivative) < 1e-8) {
    const packedRadii = new Float32Array(count).fill(baseRadius);
    return {
      baseRadius,
      maximumCorrection: 0,
      packedRadii,
      samples: Array.from({ length: count }, (_, index) => ({
        theta: index * step,
        radius: baseRadius,
        correction: 0
      }))
    };
  }

  const lowerDiagonal = new Float64Array(interiorCount);
  const centerDiagonal = new Float64Array(interiorCount);
  const upperDiagonal = new Float64Array(interiorCount);
  const sourceVector = new Float64Array(interiorCount);
  const diffusion = coefficientA(baseRadius, spin);

  for (let sample = 1; sample < count - 1; sample += 1) {
    const row = sample - 1;
    const theta = sample * step;
    const cotangent = Math.cos(theta) / Math.max(Math.sin(theta), 1e-6);
    lowerDiagonal[row] = diffusion * (1 / (step * step) - cotangent / (2 * step));
    centerDiagonal[row] = diffusion * (-2 / (step * step)) - coefficientB(theta, baseRadius, spin);
    upperDiagonal[row] = diffusion * (1 / (step * step) + cotangent / (2 * step));
    sourceVector[row] = sourceTerm(theta, baseRadius, spin, massDerivative);
  }

  const interior = solveTridiagonalSystem(lowerDiagonal, centerDiagonal, upperDiagonal, sourceVector);
  const corrections = [0, ...interior, 0];
  const packedRadii = new Float32Array(count);
  let maximumCorrection = 0;

  const samples = corrections.map((correction, index) => {
    const limitedCorrection = Math.max(Math.min(correction, 0.1 * baseRadius), -0.1 * baseRadius);
    maximumCorrection = Math.max(maximumCorrection, Math.abs(limitedCorrection));
    packedRadii[index] = baseRadius + limitedCorrection;
    return {
      theta: index * step,
      radius: packedRadii[index],
      correction: limitedCorrection
    };
  });

  return { baseRadius, maximumCorrection, samples, packedRadii };
}
