import {
  CoordinateIndex,
  advanceTimelikeWorldline,
  buildOrthonormalTetrad,
  evaluateCovariantMetric,
  evaluateOuterKerrRadius,
  evaluateZeroAngularMomentumObserver,
  raiseMomentumIndex,
  renormalizeTimelikeMomentum,
  type FourVector,
  type GeodesicState,
  type ObserverTetrad,
  type SpacetimeSample
} from "../physics/kerrVaidyaGeometry.ts";
import { evaluateMassFunction, type MassFunctionParameters } from "../physics/massFunction.ts";

// Two observer regimes. Paused: an unphysical free placement — "setting the initial
// condition" — rendered from a momentarily-at-rest ZAMO and clamped outside the
// horizon. Running: a genuine timelike worldline in the Kerr-Vaidya spacetime,
// free-falling between bounded proper-acceleration inputs; every control is thrust
// or head rotation, so what is reachable is dictated by the geometry itself
// (hovering fails near the hole, and no thrust increases r inside the horizon).

export interface CartesianVectorLike {
  x: number;
  y: number;
  z: number;
}

export type TetradFrameVector = [number, number, number];

export interface ObserverUniformState {
  cameraCoordinates: FourVector;
  observerCovariantTime: FourVector;
  observerCovariantRadial: FourVector;
  observerCovariantPolar: FourVector;
  observerCovariantAzimuthal: FourVector;
  forwardTetradFrame: TetradFrameVector;
  rightTetradFrame: TetradFrameVector;
  upTetradFrame: TetradFrameVector;
  clampedRadius: number;
}

export const MaximumProperAcceleration = 8;
export const WorldlineSubstepProperTime = 0.01;
const MinimumRadiusAboveHorizonFactor = 1.05;
const MaximumRadiusOfCelestialFactor = 0.9;
const PolarAxisAvoidanceAngle = 1e-3;

function cartesianToSphericalAngles(position: CartesianVectorLike): { radius: number; polarAngle: number; azimuthalAngle: number } {
  const radius = Math.hypot(position.x, position.y, position.z);
  return {
    radius,
    polarAngle: Math.min(
      Math.max(Math.acos(position.y / Math.max(radius, 1e-12)), PolarAxisAvoidanceAngle),
      Math.PI - PolarAxisAvoidanceAngle
    ),
    azimuthalAngle: Math.atan2(position.z, position.x)
  };
}

function lowerWithMetric(sample: SpacetimeSample, vector: FourVector): FourVector {
  const metric = evaluateCovariantMetric(sample);
  return metric.map((row) => row.reduce((total, component, index) => total + component * vector[index], 0)) as FourVector;
}

function observerStateFromTetrad(
  position: FourVector,
  sample: SpacetimeSample,
  tetrad: ObserverTetrad,
  forwardTetradFrame: TetradFrameVector,
  rightTetradFrame: TetradFrameVector,
  upTetradFrame: TetradFrameVector
): ObserverUniformState {
  return {
    cameraCoordinates: position,
    observerCovariantTime: lowerWithMetric(sample, tetrad.fourVelocity),
    observerCovariantRadial: lowerWithMetric(sample, tetrad.radialAxis),
    observerCovariantPolar: lowerWithMetric(sample, tetrad.polarAxis),
    observerCovariantAzimuthal: lowerWithMetric(sample, tetrad.azimuthalAxis),
    forwardTetradFrame,
    rightTetradFrame,
    upTetradFrame,
    clampedRadius: sample.radius
  };
}

// Paused placement: the free orbit camera, expressed as a resting ZAMO. The flat
// spherical embedding (spin axis = +y) is only the orientation convention mapping
// screen vectors onto tetrad axes.
export function computePausedObserverState(
  cartesianPosition: CartesianVectorLike,
  forward: CartesianVectorLike,
  right: CartesianVectorLike,
  up: CartesianVectorLike,
  mass: number,
  spin: number,
  advancedTime: number,
  celestialRadius: number
): ObserverUniformState {
  const spherical = cartesianToSphericalAngles(cartesianPosition);
  const radius = Math.min(
    Math.max(spherical.radius, MinimumRadiusAboveHorizonFactor * evaluateOuterKerrRadius(mass, spin)),
    MaximumRadiusOfCelestialFactor * celestialRadius
  );
  const sample: SpacetimeSample = { mass, spin, radius, polarAngle: spherical.polarAngle };
  const tetrad = evaluateZeroAngularMomentumObserver(sample);

  const sinePolar = Math.sin(spherical.polarAngle);
  const cosinePolar = Math.cos(spherical.polarAngle);
  const sineAzimuthal = Math.sin(spherical.azimuthalAngle);
  const cosineAzimuthal = Math.cos(spherical.azimuthalAngle);
  const radialUnit = { x: sinePolar * cosineAzimuthal, y: cosinePolar, z: sinePolar * sineAzimuthal };
  const polarUnit = { x: cosinePolar * cosineAzimuthal, y: -sinePolar, z: cosinePolar * sineAzimuthal };
  const azimuthalUnit = { x: -sineAzimuthal, y: 0, z: cosineAzimuthal };
  const toTetradFrame = (vector: CartesianVectorLike): TetradFrameVector => [
    vector.x * radialUnit.x + vector.y * radialUnit.y + vector.z * radialUnit.z,
    vector.x * polarUnit.x + vector.y * polarUnit.y + vector.z * polarUnit.z,
    vector.x * azimuthalUnit.x + vector.y * azimuthalUnit.y + vector.z * azimuthalUnit.z
  ];

  return observerStateFromTetrad(
    [advancedTime, radius, spherical.polarAngle, spherical.azimuthalAngle],
    sample,
    tetrad,
    toTetradFrame(forward),
    toTetradFrame(right),
    toTetradFrame(up)
  );
}

export function createRestingWorldline(
  cartesianPosition: CartesianVectorLike,
  mass: number,
  spin: number,
  advancedTime: number,
  celestialRadius: number
): GeodesicState {
  const spherical = cartesianToSphericalAngles(cartesianPosition);
  const radius = Math.min(
    Math.max(spherical.radius, MinimumRadiusAboveHorizonFactor * evaluateOuterKerrRadius(mass, spin)),
    MaximumRadiusOfCelestialFactor * celestialRadius
  );
  const sample: SpacetimeSample = { mass, spin, radius, polarAngle: spherical.polarAngle };
  const restingObserver = evaluateZeroAngularMomentumObserver(sample);
  return {
    position: [advancedTime, radius, spherical.polarAngle, spherical.azimuthalAngle],
    covariantMomentum: lowerWithMetric(sample, restingObserver.fourVelocity)
  };
}

function spacetimeSampleAt(state: GeodesicState, spin: number, massParameters: MassFunctionParameters): SpacetimeSample {
  return {
    mass: evaluateMassFunction(state.position[CoordinateIndex.AdvancedTime], massParameters).mass,
    spin,
    radius: state.position[CoordinateIndex.Radius],
    polarAngle: state.position[CoordinateIndex.PolarAngle]
  };
}

// Thrust = a boost of the four-velocity along a tetrad-frame direction with rapidity
// clamped by the maximum proper acceleration; renormalized so u.u = -1 exactly.
export function applyProperAcceleration(
  state: GeodesicState,
  spin: number,
  massParameters: MassFunctionParameters,
  thrustTetradFrame: TetradFrameVector,
  properTimeStep: number
): GeodesicState {
  const rapidityMagnitude = Math.hypot(...thrustTetradFrame);
  if (rapidityMagnitude < 1e-9) return state;
  const boundedRapidity = Math.min(rapidityMagnitude, MaximumProperAcceleration * properTimeStep);
  const scale = boundedRapidity / rapidityMagnitude;

  const sample = spacetimeSampleAt(state, spin, massParameters);
  const fourVelocity = raiseMomentumIndex(state, spin, massParameters);
  const tetrad = buildOrthonormalTetrad(sample, fourVelocity);
  const boosted = fourVelocity.map(
    (component, index) =>
      component +
      scale *
        (thrustTetradFrame[0] * tetrad.radialAxis[index] +
          thrustTetradFrame[1] * tetrad.polarAxis[index] +
          thrustTetradFrame[2] * tetrad.azimuthalAxis[index])
  ) as FourVector;
  return renormalizeTimelikeMomentum(
    { position: state.position, covariantMomentum: lowerWithMetric(sample, boosted) },
    spin,
    massParameters
  );
}

// Between the horizons the metric gradients steepen again as Delta -> 0 at the inner
// horizon, so the proper-time substep shrinks with the fractional depth toward r_-.
const InteriorSubstepMinimumFraction = 0.03;
const MaximumWorldlineSubstepsPerFrame = 600;

export function horizonRadiiAt(
  advancedTime: number,
  spin: number,
  massParameters: MassFunctionParameters
): { outer: number; inner: number } {
  const { mass } = evaluateMassFunction(advancedTime, massParameters);
  const rootTerm = Math.sqrt(Math.max(mass * mass - spin * spin, 0));
  return { outer: mass + rootTerm, inner: mass - rootTerm };
}

export function advanceWorldline(
  state: GeodesicState,
  spin: number,
  massParameters: MassFunctionParameters,
  properTimeDelta: number
): GeodesicState {
  let current = state;
  let remaining = properTimeDelta;
  for (let iteration = 0; iteration < MaximumWorldlineSubstepsPerFrame && remaining > 0; iteration += 1) {
    const horizons = horizonRadiiAt(current.position[CoordinateIndex.AdvancedTime], spin, massParameters);
    const interiorDepthFraction = Math.min(
      Math.max(
        (current.position[CoordinateIndex.Radius] - horizons.inner) / Math.max(horizons.outer - horizons.inner, 1e-6),
        InteriorSubstepMinimumFraction
      ),
      1
    );
    const substep = Math.min(WorldlineSubstepProperTime * interiorDepthFraction, remaining);
    current = advanceTimelikeWorldline(current, spin, massParameters, substep);
    remaining -= substep;
  }
  return current;
}

// Look direction as angles in the local tetrad: yaw/pitch relative to the
// "toward the hole, north up" basis A = -rhat, B = psihat, C = -thetahat.
export function lookDirectionTetradFrame(lookYaw: number, lookPitch: number): {
  forward: TetradFrameVector;
  right: TetradFrameVector;
  up: TetradFrameVector;
} {
  const cosPitch = Math.cos(lookPitch);
  const forward: TetradFrameVector = [
    -cosPitch * Math.cos(lookYaw),
    -Math.sin(lookPitch),
    cosPitch * Math.sin(lookYaw)
  ];
  const worldUp: TetradFrameVector = [0, -1, 0];
  const right: TetradFrameVector = normalizeTetradFrame(crossTetradFrame(forward, worldUp));
  const up: TetradFrameVector = crossTetradFrame(right, forward);
  return { forward, right, up };
}

export function computeRunningObserverState(
  state: GeodesicState,
  spin: number,
  massParameters: MassFunctionParameters,
  lookYaw: number,
  lookPitch: number
): ObserverUniformState {
  const sample = spacetimeSampleAt(state, spin, massParameters);
  const tetrad = buildOrthonormalTetrad(sample, raiseMomentumIndex(state, spin, massParameters));
  const look = lookDirectionTetradFrame(lookYaw, lookPitch);
  return observerStateFromTetrad(state.position, sample, tetrad, look.forward, look.right, look.up);
}

function crossTetradFrame(a: TetradFrameVector, b: TetradFrameVector): TetradFrameVector {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalizeTetradFrame(vector: TetradFrameVector): TetradFrameVector {
  const length = Math.max(Math.hypot(...vector), 1e-9);
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}
