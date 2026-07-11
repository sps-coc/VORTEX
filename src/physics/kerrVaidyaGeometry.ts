import { evaluateMassFunction, type MassFunctionParameters } from "./massFunction.ts";

// Ingoing Kerr-Vaidya metric in advanced coordinates (v, r, theta, psi),
// signature (-+++), G = c = 1. Dahal, Maharana, Simovic & Terno 2025, Eq. 2.
export type FourVector = [number, number, number, number];
export type MetricTensor = FourVector[];

export const CoordinateIndex = {
  AdvancedTime: 0,
  Radius: 1,
  PolarAngle: 2,
  AzimuthalAngle: 3
} as const;

export interface SpacetimeSample {
  mass: number;
  spin: number;
  radius: number;
  polarAngle: number;
}

export interface ObserverTetrad {
  fourVelocity: FourVector;
  radialAxis: FourVector;
  polarAxis: FourVector;
  azimuthalAxis: FourVector;
}

export interface GeodesicState {
  position: FourVector;
  covariantMomentum: FourVector;
}

export function evaluateOuterKerrRadius(mass: number, spin: number): number {
  const boundedSpin = Math.min(Math.abs(spin), mass * MaximalSpinFraction);
  return mass + Math.sqrt(Math.max(mass * mass - boundedSpin * boundedSpin, 0));
}

export function evaluateErgosphereRadius(mass: number, spin: number, polarAngle: number): number {
  const spinCosine = spin * Math.cos(polarAngle);
  return mass + Math.sqrt(Math.max(mass * mass - spinCosine * spinCosine, 0));
}

export function evaluateHorizonArea(mass: number, spin: number): number {
  const outerRadius = evaluateOuterKerrRadius(mass, spin);
  return 4 * Math.PI * (outerRadius * outerRadius + spin * spin);
}

export function evaluatePhotonOrbitRadii(mass: number, spin: number): { prograde: number; retrograde: number } {
  const spinRatio = Math.min(Math.abs(spin) / mass, MaximalSpinFraction);
  const orbitRadius = (retrogradeSign: number) =>
    2 * mass * (1 + Math.cos((2 / 3) * Math.acos(retrogradeSign * spinRatio)));
  return { prograde: orbitRadius(-1), retrograde: orbitRadius(1) };
}

// Critical impact parameter b = L/E of the equatorial circular photon orbit;
// prograde is positive, retrograde negative. Derived from R(r) = R'(r) = 0 for
// R = (E(r^2+a^2) - La)^2 - Delta (L - aE)^2.
export function evaluateShadowImpactParameters(mass: number, spin: number): { prograde: number; retrograde: number } {
  const photonOrbits = evaluatePhotonOrbitRadii(mass, spin);
  const impactParameter = (orbitRadius: number, branchSign: number) => {
    const discriminantRoot = Math.sqrt(
      Math.max(orbitRadius * orbitRadius - 2 * mass * orbitRadius + spin * spin, 0)
    );
    return (
      (orbitRadius * orbitRadius + spin * spin + branchSign * spin * discriminantRoot) /
      (spin + branchSign * discriminantRoot)
    );
  };
  return {
    prograde: impactParameter(photonOrbits.prograde, 1),
    retrograde: impactParameter(photonOrbits.retrograde, -1)
  };
}

// Apparent angular radii of the equatorial shadow edges for a ZAMO at rest at
// observerRadius, exact at finite distance: a photon with impact parameter b = L/E
// reaches the observer with L = b / (u^v - b u^psi) (from the unit-observed-frequency
// normalization), and its sky angle from the forward axis obeys
// sin(angle) = |L| / sqrt(g_psipsi). Reduces to Synge's formula for spin = 0.
export function evaluateEquatorialShadowEdgeAngles(
  mass: number,
  spin: number,
  observerRadius: number
): { prograde: number; retrograde: number } {
  const impactParameters = evaluateShadowImpactParameters(mass, spin);
  const sample: SpacetimeSample = { mass, spin, radius: observerRadius, polarAngle: Math.PI / 2 };
  const metric = evaluateCovariantMetric(sample);
  const observer = evaluateZeroAngularMomentumObserver(sample);
  const advancedTimeRate = observer.fourVelocity[CoordinateIndex.AdvancedTime];
  const draggingRate = observer.fourVelocity[CoordinateIndex.AzimuthalAngle];
  const azimuthalMetric = metric[CoordinateIndex.AzimuthalAngle][CoordinateIndex.AzimuthalAngle];
  const edgeAngle = (impactParameter: number) => {
    const angularMomentum = impactParameter / (advancedTimeRate - impactParameter * draggingRate);
    return Math.asin(Math.abs(angularMomentum) / Math.sqrt(azimuthalMetric));
  };
  return {
    prograde: edgeAngle(impactParameters.prograde),
    retrograde: edgeAngle(impactParameters.retrograde)
  };
}

// Bardeen, Press & Teukolsky 1972 prograde ISCO.
export function evaluateInnermostStableCircularOrbitRadius(mass: number, spin: number): number {
  const spinRatio = Math.min(Math.abs(spin) / mass, 1);
  const firstAuxiliary =
    1 +
    Math.cbrt(1 - spinRatio * spinRatio) * (Math.cbrt(1 + spinRatio) + Math.cbrt(1 - spinRatio));
  const secondAuxiliary = Math.sqrt(3 * spinRatio * spinRatio + firstAuxiliary * firstAuxiliary);
  return (
    mass *
    (3 +
      secondAuxiliary -
      Math.sqrt((3 - firstAuxiliary) * (3 + firstAuxiliary + 2 * secondAuxiliary)))
  );
}

export function evaluateCovariantMetric(sample: SpacetimeSample): MetricTensor {
  const { mass, spin, radius, polarAngle } = sample;
  const sineSquared = Math.sin(polarAngle) ** 2;
  const rhoSquared = radius * radius + spin * spin * Math.cos(polarAngle) ** 2;
  const delta = radius * radius - 2 * mass * radius + spin * spin;
  const sigmaSquared = (radius * radius + spin * spin) ** 2 - spin * spin * delta * sineSquared;

  const metric: MetricTensor = zeroMatrix();
  metric[CoordinateIndex.AdvancedTime][CoordinateIndex.AdvancedTime] = -(1 - (2 * mass * radius) / rhoSquared);
  metric[CoordinateIndex.AdvancedTime][CoordinateIndex.Radius] = 1;
  metric[CoordinateIndex.Radius][CoordinateIndex.AdvancedTime] = 1;
  metric[CoordinateIndex.AdvancedTime][CoordinateIndex.AzimuthalAngle] =
    (-2 * spin * mass * radius * sineSquared) / rhoSquared;
  metric[CoordinateIndex.AzimuthalAngle][CoordinateIndex.AdvancedTime] =
    metric[CoordinateIndex.AdvancedTime][CoordinateIndex.AzimuthalAngle];
  metric[CoordinateIndex.Radius][CoordinateIndex.AzimuthalAngle] = -spin * sineSquared;
  metric[CoordinateIndex.AzimuthalAngle][CoordinateIndex.Radius] = -spin * sineSquared;
  metric[CoordinateIndex.PolarAngle][CoordinateIndex.PolarAngle] = rhoSquared;
  metric[CoordinateIndex.AzimuthalAngle][CoordinateIndex.AzimuthalAngle] =
    (sigmaSquared * sineSquared) / rhoSquared;
  return metric;
}

// Only the rr component depends on M(v); everything else is mass-independent.
export function evaluateInverseMetric(sample: SpacetimeSample): MetricTensor {
  const { mass, spin, radius, polarAngle } = sample;
  const sineSquared = Math.sin(polarAngle) ** 2;
  const rhoSquared = radius * radius + spin * spin * Math.cos(polarAngle) ** 2;
  const delta = radius * radius - 2 * mass * radius + spin * spin;

  const inverse: MetricTensor = zeroMatrix();
  inverse[CoordinateIndex.AdvancedTime][CoordinateIndex.AdvancedTime] = (spin * spin * sineSquared) / rhoSquared;
  inverse[CoordinateIndex.AdvancedTime][CoordinateIndex.Radius] = (radius * radius + spin * spin) / rhoSquared;
  inverse[CoordinateIndex.Radius][CoordinateIndex.AdvancedTime] =
    inverse[CoordinateIndex.AdvancedTime][CoordinateIndex.Radius];
  inverse[CoordinateIndex.AdvancedTime][CoordinateIndex.AzimuthalAngle] = spin / rhoSquared;
  inverse[CoordinateIndex.AzimuthalAngle][CoordinateIndex.AdvancedTime] = spin / rhoSquared;
  inverse[CoordinateIndex.Radius][CoordinateIndex.Radius] = delta / rhoSquared;
  inverse[CoordinateIndex.Radius][CoordinateIndex.AzimuthalAngle] = spin / rhoSquared;
  inverse[CoordinateIndex.AzimuthalAngle][CoordinateIndex.Radius] = spin / rhoSquared;
  inverse[CoordinateIndex.PolarAngle][CoordinateIndex.PolarAngle] = 1 / rhoSquared;
  inverse[CoordinateIndex.AzimuthalAngle][CoordinateIndex.AzimuthalAngle] = 1 / (rhoSquared * sineSquared);
  return inverse;
}

export function contractWithMetric(metric: MetricTensor, left: FourVector, right: FourVector): number {
  return metric.reduce(
    (total, row, rowIndex) =>
      total + row.reduce((rowTotal, component, columnIndex) => rowTotal + component * left[rowIndex] * right[columnIndex], 0),
    0
  );
}

// Zero-angular-momentum observer at rest in (r, theta): u_psi = 0, u^r = u^theta = 0
// (2025 paper Eqs. 17-18 with rdot = thetadot = 0). Spatial axes are metric
// Gram-Schmidt-orthonormalized coordinate directions; azimuthal and polar axes are
// already orthogonal to u by the ZAMO condition and axisymmetry.
export function evaluateZeroAngularMomentumObserver(sample: SpacetimeSample): ObserverTetrad {
  const metric = evaluateCovariantMetric(sample);
  const timeTime = metric[CoordinateIndex.AdvancedTime][CoordinateIndex.AdvancedTime];
  const timeAzimuthal = metric[CoordinateIndex.AdvancedTime][CoordinateIndex.AzimuthalAngle];
  const azimuthalAzimuthal = metric[CoordinateIndex.AzimuthalAngle][CoordinateIndex.AzimuthalAngle];

  const advancedTimeRate = 1 / Math.sqrt((timeAzimuthal * timeAzimuthal) / azimuthalAzimuthal - timeTime);
  const fourVelocity: FourVector = [
    advancedTimeRate,
    0,
    0,
    (-timeAzimuthal / azimuthalAzimuthal) * advancedTimeRate
  ];

  const polarAxis: FourVector = [0, 0, 1 / Math.sqrt(metric[CoordinateIndex.PolarAngle][CoordinateIndex.PolarAngle]), 0];
  const azimuthalAxis: FourVector = [0, 0, 0, 1 / Math.sqrt(azimuthalAzimuthal)];

  const radialCoordinateAxis: FourVector = [0, 1, 0, 0];
  const alongTime = contractWithMetric(metric, radialCoordinateAxis, fourVelocity);
  const alongAzimuthal = contractWithMetric(metric, radialCoordinateAxis, azimuthalAxis);
  const unnormalizedRadial = radialCoordinateAxis.map(
    (component, index) => component + alongTime * fourVelocity[index] - alongAzimuthal * azimuthalAxis[index]
  ) as FourVector;
  const radialNorm = Math.sqrt(contractWithMetric(metric, unnormalizedRadial, unnormalizedRadial));
  const radialAxis = unnormalizedRadial.map((component) => component / radialNorm) as FourVector;

  return { fourVelocity, radialAxis, polarAxis, azimuthalAxis };
}

// Metric Gram-Schmidt orthonormal tetrad around an arbitrary timelike four-velocity,
// spatial axes aligned to the polar, azimuthal, and radial coordinate directions in
// that order. Reduces to the ZAMO tetrad when the observer is a resting ZAMO.
export function buildOrthonormalTetrad(sample: SpacetimeSample, fourVelocity: FourVector): ObserverTetrad {
  const metric = evaluateCovariantMetric(sample);
  const projectAndNormalize = (axis: FourVector, subtractions: Array<{ vector: FourVector; norm: number }>): FourVector => {
    const projected = subtractions.reduce((current, { vector, norm }) => {
      const along = contractWithMetric(metric, current, vector) / norm;
      return current.map((component, index) => component - along * vector[index]) as FourVector;
    }, axis);
    const norm = Math.sqrt(Math.max(contractWithMetric(metric, projected, projected), 1e-12));
    return projected.map((component) => component / norm) as FourVector;
  };

  const timeSubtraction = { vector: fourVelocity, norm: -1 };
  const polarAxis = projectAndNormalize([0, 0, 1, 0], [timeSubtraction]);
  const azimuthalAxis = projectAndNormalize([0, 0, 0, 1], [timeSubtraction, { vector: polarAxis, norm: 1 }]);
  const radialAxis = projectAndNormalize(
    [0, 1, 0, 0],
    [timeSubtraction, { vector: polarAxis, norm: 1 }, { vector: azimuthalAxis, norm: 1 }]
  );
  return { fourVelocity, radialAxis, polarAxis, azimuthalAxis };
}

// Timelike geodesics need the full Hamiltonian H = (1/2) g^{mu nu} p_mu p_nu — the
// conformal rescaling used for null rays would change the paths here. p_psi is still
// exactly conserved and the Vaidya term is still confined to dp_v.
export function evaluateTimelikeDerivatives(
  state: GeodesicState,
  spin: number,
  massParameters: MassFunctionParameters
): GeodesicDerivatives {
  const [advancedTime, radius, polarAngle] = state.position;
  const [timeMomentum, radialMomentum, polarMomentum, azimuthalMomentum] = state.covariantMomentum;
  const { mass, massDerivative } = evaluateMassFunction(advancedTime, massParameters);
  const sine = Math.sin(polarAngle);
  const safeSine = sine >= 0 ? Math.max(sine, PolarSineFloor) : Math.min(sine, -PolarSineFloor);
  const cosine = Math.cos(polarAngle);
  const sineSquared = safeSine * safeSine;
  const radiusSpinSquared = radius * radius + spin * spin;
  const delta = radiusSpinSquared - 2 * mass * radius;
  const rhoSquared = radius * radius + spin * spin * cosine * cosine;

  const conformalHamiltonian =
    0.5 *
      (spin * spin * sineSquared * timeMomentum * timeMomentum +
        delta * radialMomentum * radialMomentum +
        polarMomentum * polarMomentum +
        (azimuthalMomentum * azimuthalMomentum) / sineSquared) +
    radiusSpinSquared * timeMomentum * radialMomentum +
    spin * timeMomentum * azimuthalMomentum +
    spin * radialMomentum * azimuthalMomentum;

  const conformalRadialGradient = 2 * radius * timeMomentum * radialMomentum + (radius - mass) * radialMomentum * radialMomentum;
  const conformalPolarGradient =
    spin * spin * safeSine * cosine * timeMomentum * timeMomentum -
    (cosine / (sineSquared * safeSine)) * azimuthalMomentum * azimuthalMomentum;
  const rhoRadialGradient = 2 * radius;
  const rhoPolarGradient = -2 * spin * spin * safeSine * cosine;

  return {
    position: [
      (spin * spin * sineSquared * timeMomentum + radiusSpinSquared * radialMomentum + spin * azimuthalMomentum) / rhoSquared,
      (radiusSpinSquared * timeMomentum + delta * radialMomentum + spin * azimuthalMomentum) / rhoSquared,
      polarMomentum / rhoSquared,
      (spin * timeMomentum + spin * radialMomentum + azimuthalMomentum / sineSquared) / rhoSquared
    ],
    covariantMomentum: [
      (massDerivative * radius * radialMomentum * radialMomentum) / rhoSquared,
      -conformalRadialGradient / rhoSquared + (conformalHamiltonian * rhoRadialGradient) / (rhoSquared * rhoSquared),
      -conformalPolarGradient / rhoSquared + (conformalHamiltonian * rhoPolarGradient) / (rhoSquared * rhoSquared),
      0
    ]
  };
}

// One proper-time step of a free-fall (plus renormalization) worldline. The momentum
// is rescaled afterward so u.u = -1 holds exactly against integration drift.
export function advanceTimelikeWorldline(
  state: GeodesicState,
  spin: number,
  massParameters: MassFunctionParameters,
  properTimeStep: number
): GeodesicState {
  const applyDerivatives = (base: GeodesicState, derivatives: GeodesicDerivatives, scale: number): GeodesicState => ({
    position: base.position.map((component, index) => component + scale * derivatives.position[index]) as FourVector,
    covariantMomentum: base.covariantMomentum.map(
      (component, index) => component + scale * derivatives.covariantMomentum[index]
    ) as FourVector
  });
  const slopeOne = evaluateTimelikeDerivatives(state, spin, massParameters);
  const slopeTwo = evaluateTimelikeDerivatives(applyDerivatives(state, slopeOne, properTimeStep / 2), spin, massParameters);
  const slopeThree = evaluateTimelikeDerivatives(applyDerivatives(state, slopeTwo, properTimeStep / 2), spin, massParameters);
  const slopeFour = evaluateTimelikeDerivatives(applyDerivatives(state, slopeThree, properTimeStep), spin, massParameters);

  const combine = (index: number, pick: (slopes: GeodesicDerivatives) => FourVector) =>
    (pick(slopeOne)[index] + 2 * pick(slopeTwo)[index] + 2 * pick(slopeThree)[index] + pick(slopeFour)[index]) / 6;
  const advanced: GeodesicState = {
    position: state.position.map(
      (component, index) => component + properTimeStep * combine(index, (slopes) => slopes.position)
    ) as FourVector,
    covariantMomentum: state.covariantMomentum.map(
      (component, index) => component + properTimeStep * combine(index, (slopes) => slopes.covariantMomentum)
    ) as FourVector
  };
  return renormalizeTimelikeMomentum(advanced, spin, massParameters);
}

export function raiseMomentumIndex(
  state: GeodesicState,
  spin: number,
  massParameters: MassFunctionParameters
): FourVector {
  const { mass } = evaluateMassFunction(state.position[CoordinateIndex.AdvancedTime], massParameters);
  const inverse = evaluateInverseMetric({
    mass,
    spin,
    radius: state.position[CoordinateIndex.Radius],
    polarAngle: state.position[CoordinateIndex.PolarAngle]
  });
  return inverse.map((row) =>
    row.reduce((total, component, columnIndex) => total + component * state.covariantMomentum[columnIndex], 0)
  ) as FourVector;
}

export function renormalizeTimelikeMomentum(
  state: GeodesicState,
  spin: number,
  massParameters: MassFunctionParameters
): GeodesicState {
  const raised = raiseMomentumIndex(state, spin, massParameters);
  const normSquared = raised.reduce((total, component, index) => total + component * state.covariantMomentum[index], 0);
  const scale = 1 / Math.sqrt(Math.max(-normSquared, 1e-12));
  return {
    position: state.position,
    covariantMomentum: state.covariantMomentum.map((component) => component * scale) as FourVector
  };
}

const PolarSineFloor = 1e-4;

// Backward ray tracing: integrating q = -k forward in lambda traces the received
// photon k = omega(u + n) into the past. With q = -u + d and |d| = 1 the observed
// frequency is q . u = 1, and the blueshift factor at an emitter is 1 / (p_mu u_em^mu).
export function createCameraRayMomentum(
  sample: SpacetimeSample,
  observer: ObserverTetrad,
  lookDirection: { radial: number; polar: number; azimuthal: number }
): FourVector {
  const metric = evaluateCovariantMetric(sample);
  const contravariant = observer.fourVelocity.map(
    (timeComponent, index) =>
      -timeComponent +
      lookDirection.radial * observer.radialAxis[index] +
      lookDirection.polar * observer.polarAxis[index] +
      lookDirection.azimuthal * observer.azimuthalAxis[index]
  ) as FourVector;
  return metric.map((row) =>
    row.reduce((total, component, columnIndex) => total + component * contravariant[columnIndex], 0)
  ) as FourVector;
}

// Conformal Hamiltonian: Htilde = rho^2 . (1/2) g^{mu nu} p_mu p_nu. Vanishes on null
// geodesics and only reparametrizes the affine parameter, so Hamilton's equations for
// Htilde trace the same rays with far fewer operations.
export function evaluateConformalHamiltonian(
  state: GeodesicState,
  spin: number,
  massParameters: MassFunctionParameters
): number {
  const [advancedTime, radius, polarAngle] = state.position;
  const [timeMomentum, radialMomentum, polarMomentum, azimuthalMomentum] = state.covariantMomentum;
  const { mass } = evaluateMassFunction(advancedTime, massParameters);
  const sineSquared = Math.sin(polarAngle) ** 2;
  const delta = radius * radius - 2 * mass * radius + spin * spin;
  return (
    0.5 *
      (spin * spin * sineSquared * timeMomentum * timeMomentum +
        delta * radialMomentum * radialMomentum +
        polarMomentum * polarMomentum +
        (azimuthalMomentum * azimuthalMomentum) / sineSquared) +
    (radius * radius + spin * spin) * timeMomentum * radialMomentum +
    spin * timeMomentum * azimuthalMomentum +
    spin * radialMomentum * azimuthalMomentum
  );
}

// Relative null error: |Htilde| normalized by the magnitude of its largest term,
// so the tolerance is scale-free in radius and ray energy.
export function evaluateNullConstraintError(
  state: GeodesicState,
  spin: number,
  massParameters: MassFunctionParameters
): number {
  const [advancedTime, radius, polarAngle] = state.position;
  const [timeMomentum, radialMomentum, polarMomentum, azimuthalMomentum] = state.covariantMomentum;
  const { mass } = evaluateMassFunction(advancedTime, massParameters);
  const sineSquared = Math.sin(polarAngle) ** 2;
  const delta = radius * radius - 2 * mass * radius + spin * spin;
  const terms = [
    0.5 * spin * spin * sineSquared * timeMomentum * timeMomentum,
    0.5 * delta * radialMomentum * radialMomentum,
    0.5 * polarMomentum * polarMomentum,
    (0.5 * azimuthalMomentum * azimuthalMomentum) / sineSquared,
    (radius * radius + spin * spin) * timeMomentum * radialMomentum,
    spin * timeMomentum * azimuthalMomentum,
    spin * radialMomentum * azimuthalMomentum
  ];
  const scale = Math.max(...terms.map(Math.abs), Number.MIN_VALUE);
  return Math.abs(terms.reduce((total, term) => total + term, 0)) / scale;
}

export interface GeodesicDerivatives {
  position: FourVector;
  covariantMomentum: FourVector;
}

// The entire Vaidya modification relative to Kerr is dp_v/dlambda = M'(v) r p_r^2;
// p_psi is exactly conserved by axisymmetry.
function evaluateGeodesicDerivatives(
  state: GeodesicState,
  spin: number,
  massParameters: MassFunctionParameters
): GeodesicDerivatives {
  const [advancedTime, radius, polarAngle] = state.position;
  const [timeMomentum, radialMomentum, polarMomentum, azimuthalMomentum] = state.covariantMomentum;
  const { mass, massDerivative } = evaluateMassFunction(advancedTime, massParameters);
  const sine = Math.sin(polarAngle);
  const cosine = Math.cos(polarAngle);
  const sineSquared = sine * sine;
  const radiusSquaredPlusSpinSquared = radius * radius + spin * spin;
  const delta = radiusSquaredPlusSpinSquared - 2 * mass * radius;

  return {
    position: [
      spin * spin * sineSquared * timeMomentum + radiusSquaredPlusSpinSquared * radialMomentum + spin * azimuthalMomentum,
      radiusSquaredPlusSpinSquared * timeMomentum + delta * radialMomentum + spin * azimuthalMomentum,
      polarMomentum,
      spin * timeMomentum + spin * radialMomentum + azimuthalMomentum / sineSquared
    ],
    covariantMomentum: [
      massDerivative * radius * radialMomentum * radialMomentum,
      -2 * radius * timeMomentum * radialMomentum - (radius - mass) * radialMomentum * radialMomentum,
      -spin * spin * sine * cosine * timeMomentum * timeMomentum +
        (cosine / (sineSquared * sine)) * azimuthalMomentum * azimuthalMomentum,
      0
    ]
  };
}

// One adaptive step: the first RK4 slope doubles as the step-size probe, so each
// step costs exactly four derivative evaluations. The step aims for a fixed fraction
// of the local radial scale, tightening near the horizon where the conformal
// velocities steepen.
export function advanceGeodesicAdaptively(
  state: GeodesicState,
  spin: number,
  massParameters: MassFunctionParameters
): GeodesicState {
  const slopeOne = evaluateGeodesicDerivatives(state, spin, massParameters);

  const [advancedTime, radius, polarAngle] = state.position;
  const { mass } = evaluateMassFunction(advancedTime, massParameters);
  const horizonRadius = evaluateOuterKerrRadius(mass, spin);
  const spatialSpeed = Math.sqrt(
    slopeOne.position[CoordinateIndex.Radius] ** 2 +
      (radius * slopeOne.position[CoordinateIndex.PolarAngle]) ** 2 +
      (radius * Math.sin(polarAngle) * slopeOne.position[CoordinateIndex.AzimuthalAngle]) ** 2
  );
  const targetArcLength =
    IntegrationArcFraction * Math.min(radius, Math.max(radius - HorizonApproachFraction * horizonRadius, NearHorizonArcFloor));
  const stepSize = targetArcLength / Math.max(spatialSpeed, MinimalConformalSpeed);

  const applyDerivatives = (base: GeodesicState, derivatives: GeodesicDerivatives, scale: number): GeodesicState => ({
    position: base.position.map((component, index) => component + scale * derivatives.position[index]) as FourVector,
    covariantMomentum: base.covariantMomentum.map(
      (component, index) => component + scale * derivatives.covariantMomentum[index]
    ) as FourVector
  });

  const slopeTwo = evaluateGeodesicDerivatives(applyDerivatives(state, slopeOne, stepSize / 2), spin, massParameters);
  const slopeThree = evaluateGeodesicDerivatives(applyDerivatives(state, slopeTwo, stepSize / 2), spin, massParameters);
  const slopeFour = evaluateGeodesicDerivatives(applyDerivatives(state, slopeThree, stepSize), spin, massParameters);

  const combine = (index: number, pick: (slopes: GeodesicDerivatives) => FourVector) =>
    (pick(slopeOne)[index] + 2 * pick(slopeTwo)[index] + 2 * pick(slopeThree)[index] + pick(slopeFour)[index]) / 6;

  return {
    position: state.position.map(
      (component, index) => component + stepSize * combine(index, (slopes) => slopes.position)
    ) as FourVector,
    covariantMomentum: state.covariantMomentum.map(
      (component, index) => component + stepSize * combine(index, (slopes) => slopes.covariantMomentum)
    ) as FourVector
  };
}

const MaximalSpinFraction = 0.999999;
const IntegrationArcFraction = 0.03;
const HorizonApproachFraction = 0.9;
const NearHorizonArcFloor = 0.02;
const MinimalConformalSpeed = 1e-12;

function zeroMatrix(): MetricTensor {
  return Array.from({ length: 4 }, () => [0, 0, 0, 0] as FourVector);
}
