import {
  CoordinateIndex,
  advanceGeodesicAdaptively,
  advanceTimelikeWorldline,
  buildOrthonormalTetrad,
  contractWithMetric,
  evaluateTimelikeDerivatives,
  raiseMomentumIndex,
  createCameraRayMomentum,
  evaluateConformalHamiltonian,
  evaluateCovariantMetric,
  evaluateInnermostStableCircularOrbitRadius,
  evaluateInverseMetric,
  evaluateNullConstraintError,
  evaluateOuterKerrRadius,
  evaluatePhotonOrbitRadii,
  evaluateShadowImpactParameters,
  evaluateHorizonThermodynamics,
  evaluateZeroAngularMomentumObserver,
  type FourVector,
  type GeodesicState,
  type SpacetimeSample
} from "../src/physics/kerrVaidyaGeometry.ts";
import { evaluateMassFunction, type MassFunctionParameters } from "../src/physics/massFunction.ts";
import { solveApparentHorizon } from "../src/physics/apparentHorizon.ts";
import {
  AnalogueMatchingInvariant,
  evaluateFluidVortexAnalogue,
  evaluateFluidVortexAnalogueRates,
  evaluateNondispersiveCeilingFrequency,
  evaluateSurfaceWaveDispersion,
  type AnalogueMappingConfiguration
} from "../src/physics/fluidVortexAnalogue.ts";

const IdentityTolerance = 1e-10;
const TetradTolerance = 1e-9;
const NullConstraintTolerance = 1e-9;
const EnergyConservationTolerance = 1e-7;
const NullDriftTolerance = 1e-6;
const CriticalImpactParameterRelativeTolerance = 0.005;
const NondispersiveBandTolerance = 0.05;
const HorizonCorrectionExpected = 3.57e-5;
const HorizonCorrectionRelativeTolerance = 0.15;
const EquatorialPolarAngle = Math.PI / 2;
const RandomSampleCount = 200;

const SchwarzschildLimits = {
  photonSphereRadius: 3,
  innermostStableOrbitRadius: 6,
  criticalImpactParameter: Math.sqrt(27)
};
const ExtremalKerrLimits = {
  progradePhotonOrbitRadius: 1,
  retrogradePhotonOrbitRadius: 4,
  progradeImpactParameter: 2,
  retrogradeImpactParameter: -7,
  innermostStableOrbitRadius: 1
};

const failures: string[] = [];
function check(name: string, passed: boolean, detail: string): void {
  console.log(`${passed ? "ok  " : "FAIL"} ${name}${passed ? "" : ` — ${detail}`}`);
  if (!passed) failures.push(name);
}

function randomSample(): SpacetimeSample {
  const mass = 0.5 + 1.5 * Math.random();
  const spin = 0.998 * mass * Math.random();
  const outerRadius = evaluateOuterKerrRadius(mass, spin);
  return {
    mass,
    spin,
    radius: outerRadius * (1.02 + 48 * Math.random()),
    polarAngle: 0.05 + (Math.PI - 0.1) * Math.random()
  };
}

function maximumOver(count: number, evaluate: (sample: SpacetimeSample) => number): number {
  return Math.max(...Array.from({ length: count }, () => evaluate(randomSample())));
}

// --- Inverse metric identity -------------------------------------------------
const worstIdentityError = maximumOver(RandomSampleCount, (sample) => {
  const metric = evaluateCovariantMetric(sample);
  const inverse = evaluateInverseMetric(sample);
  return Math.max(
    ...metric.map((_, rowIndex) =>
      Math.max(
        ...metric.map((__, columnIndex) => {
          const product = metric[rowIndex].reduce(
            (total, component, middleIndex) => total + component * inverse[middleIndex][columnIndex],
            0
          );
          return Math.abs(product - (rowIndex === columnIndex ? 1 : 0));
        })
      )
    )
  );
});
check("inverse metric satisfies g.gInverse = identity", worstIdentityError < IdentityTolerance, `max error ${worstIdentityError}`);

// --- ZAMO tetrad orthonormality ----------------------------------------------
const worstTetradError = maximumOver(RandomSampleCount, (sample) => {
  const metric = evaluateCovariantMetric(sample);
  const tetrad = evaluateZeroAngularMomentumObserver(sample);
  const axes = [tetrad.fourVelocity, tetrad.radialAxis, tetrad.polarAxis, tetrad.azimuthalAxis];
  const minkowskiDiagonal = [-1, 1, 1, 1];
  return Math.max(
    ...axes.map((left, leftIndex) =>
      Math.max(
        ...axes.map((right, rightIndex) =>
          Math.abs(contractWithMetric(metric, left, right) - (leftIndex === rightIndex ? minkowskiDiagonal[leftIndex] : 0))
        )
      )
    )
  );
});
check("ZAMO tetrad is metric-orthonormal", worstTetradError < TetradTolerance, `max error ${worstTetradError}`);

const insideErgosphereSample: SpacetimeSample = { mass: 1, spin: 0.9, radius: 1.6, polarAngle: EquatorialPolarAngle };
const insideErgosphereTetrad = evaluateZeroAngularMomentumObserver(insideErgosphereSample);
const insideErgosphereNorm = contractWithMetric(
  evaluateCovariantMetric(insideErgosphereSample),
  insideErgosphereTetrad.fourVelocity,
  insideErgosphereTetrad.fourVelocity
);
check(
  "ZAMO four-velocity is timelike inside the ergosphere",
  Math.abs(insideErgosphereNorm + 1) < TetradTolerance,
  `u.u = ${insideErgosphereNorm}`
);

// --- Camera rays are null with unit observed frequency ------------------------
const staticMassParameters: MassFunctionParameters = { initialMass: 1, accretionRate: 0, smoothingTime: 24 };
const worstCameraRayError = maximumOver(RandomSampleCount, (sample) => {
  const tetrad = evaluateZeroAngularMomentumObserver(sample);
  const polarTilt = Math.acos(2 * Math.random() - 1);
  const azimuthalTilt = 2 * Math.PI * Math.random();
  const momentum = createCameraRayMomentum(sample, tetrad, {
    radial: Math.sin(polarTilt) * Math.cos(azimuthalTilt),
    polar: Math.sin(polarTilt) * Math.sin(azimuthalTilt),
    azimuthal: Math.cos(polarTilt)
  });
  const state: GeodesicState = {
    position: [0, sample.radius, sample.polarAngle, 0],
    covariantMomentum: momentum
  };
  const hamiltonian = Math.abs(
    evaluateConformalHamiltonian(state, sample.spin, { ...staticMassParameters, initialMass: sample.mass })
  );
  const observedFrequency = momentum.reduce((total, component, index) => total + component * tetrad.fourVelocity[index], 0);
  return Math.max(hamiltonian, Math.abs(observedFrequency - 1));
});
check("camera rays are null with unit observed frequency", worstCameraRayError < NullConstraintTolerance, `max error ${worstCameraRayError}`);

// --- Characteristic radii in known limits -------------------------------------
const schwarzschildOrbits = evaluatePhotonOrbitRadii(1, 0);
check(
  "Schwarzschild photon sphere at 3M",
  Math.abs(schwarzschildOrbits.prograde - SchwarzschildLimits.photonSphereRadius) < 1e-12 &&
    Math.abs(schwarzschildOrbits.retrograde - SchwarzschildLimits.photonSphereRadius) < 1e-12,
  `${schwarzschildOrbits.prograde}, ${schwarzschildOrbits.retrograde}`
);
const schwarzschildShadow = evaluateShadowImpactParameters(1, 0);
check(
  "Schwarzschild critical impact parameter sqrt(27)M",
  Math.abs(schwarzschildShadow.prograde - SchwarzschildLimits.criticalImpactParameter) < 1e-12 &&
    Math.abs(schwarzschildShadow.retrograde + SchwarzschildLimits.criticalImpactParameter) < 1e-12,
  `${schwarzschildShadow.prograde}, ${schwarzschildShadow.retrograde}`
);
check(
  "Schwarzschild ISCO at 6M",
  Math.abs(evaluateInnermostStableCircularOrbitRadius(1, 0) - SchwarzschildLimits.innermostStableOrbitRadius) < 1e-9,
  `${evaluateInnermostStableCircularOrbitRadius(1, 0)}`
);
const nearExtremalOrbits = evaluatePhotonOrbitRadii(1, 0.9999999);
const nearExtremalShadow = evaluateShadowImpactParameters(1, 0.9999999);
check(
  "extremal Kerr photon orbits at M and 4M",
  Math.abs(nearExtremalOrbits.prograde - ExtremalKerrLimits.progradePhotonOrbitRadius) < 5e-3 &&
    Math.abs(nearExtremalOrbits.retrograde - ExtremalKerrLimits.retrogradePhotonOrbitRadius) < 1e-3,
  `${nearExtremalOrbits.prograde}, ${nearExtremalOrbits.retrograde}`
);
check(
  "extremal Kerr impact parameters 2M and -7M",
  Math.abs(nearExtremalShadow.prograde - ExtremalKerrLimits.progradeImpactParameter) < 1e-2 &&
    Math.abs(nearExtremalShadow.retrograde - ExtremalKerrLimits.retrogradeImpactParameter) < 1e-3,
  `${nearExtremalShadow.prograde}, ${nearExtremalShadow.retrograde}`
);
check(
  "extremal Kerr ISCO at M",
  Math.abs(evaluateInnermostStableCircularOrbitRadius(1, 1) - ExtremalKerrLimits.innermostStableOrbitRadius) < 1e-6,
  `${evaluateInnermostStableCircularOrbitRadius(1, 1)}`
);

// --- Geodesic integration: conservation in pure Kerr ---------------------------
interface TraceResult {
  outcome: "captured" | "escaped" | "exhausted";
  maximumEnergyDrift: number;
  maximumNullDrift: number;
  impactParameter: number;
}

function traceRay(
  spin: number,
  massParameters: MassFunctionParameters,
  startRadius: number,
  lookDirection: { radial: number; polar: number; azimuthal: number },
  maximumSteps: number
): TraceResult {
  const { mass } = evaluateMassFunction(0, massParameters);
  const sample: SpacetimeSample = { mass, spin, radius: startRadius, polarAngle: EquatorialPolarAngle };
  const tetrad = evaluateZeroAngularMomentumObserver(sample);
  const momentum = createCameraRayMomentum(sample, tetrad, lookDirection);
  let state: GeodesicState = { position: [0, startRadius, EquatorialPolarAngle, 0], covariantMomentum: momentum };

  const initialEnergy = -momentum[CoordinateIndex.AdvancedTime];
  const impactParameter = momentum[CoordinateIndex.AzimuthalAngle] / initialEnergy;
  const escapeRadius = startRadius * 1.2;
  let maximumEnergyDrift = 0;
  let maximumNullDrift = 0;

  for (let step = 0; step < maximumSteps; step += 1) {
    state = advanceGeodesicAdaptively(state, spin, massParameters);
    const radius = state.position[CoordinateIndex.Radius];
    const localMass = evaluateMassFunction(state.position[CoordinateIndex.AdvancedTime], massParameters).mass;
    maximumEnergyDrift = Math.max(
      maximumEnergyDrift,
      Math.abs(-state.covariantMomentum[CoordinateIndex.AdvancedTime] - initialEnergy)
    );
    maximumNullDrift = Math.max(maximumNullDrift, evaluateNullConstraintError(state, spin, massParameters));
    if (radius < evaluateOuterKerrRadius(localMass, spin) * 1.001) {
      return { outcome: "captured", maximumEnergyDrift, maximumNullDrift, impactParameter };
    }
    if (radius > escapeRadius) {
      return { outcome: "escaped", maximumEnergyDrift, maximumNullDrift, impactParameter };
    }
  }
  return { outcome: "exhausted", maximumEnergyDrift, maximumNullDrift, impactParameter };
}

const kerrConservationTraces = Array.from({ length: 20 }, (_, index) => {
  const tilt = -0.15 + (0.3 * index) / 19;
  return traceRay(0.9, staticMassParameters, 30, {
    radial: -Math.cos(tilt) * Math.cos(0.06),
    polar: Math.sin(tilt),
    azimuthal: Math.cos(tilt) * Math.sin(0.06)
  }, 200000);
});
const worstEnergyDrift = Math.max(...kerrConservationTraces.map((trace) => trace.maximumEnergyDrift));
const worstNullDrift = Math.max(...kerrConservationTraces.map((trace) => trace.maximumNullDrift));
check("p_v conserved along pure-Kerr geodesics", worstEnergyDrift < EnergyConservationTolerance, `max drift ${worstEnergyDrift}`);
check("null constraint preserved along pure-Kerr geodesics", worstNullDrift < NullDriftTolerance, `max drift ${worstNullDrift}`);

// --- End-to-end lensing: Schwarzschild critical impact parameter ---------------
function classifyByAimAngle(aimAngle: number): TraceResult {
  return traceRay(0, staticMassParameters, 100, {
    radial: -Math.cos(aimAngle),
    polar: 0,
    azimuthal: Math.sin(aimAngle)
  }, 400000);
}

let capturedAngle = 0.01;
let escapedAngle = 0.2;
let criticalImpactParameter = Number.NaN;
for (let iteration = 0; iteration < 48; iteration += 1) {
  const midpointAngle = (capturedAngle + escapedAngle) / 2;
  const trace = classifyByAimAngle(midpointAngle);
  if (trace.outcome === "captured") capturedAngle = midpointAngle;
  else escapedAngle = midpointAngle;
  criticalImpactParameter = Math.abs(trace.impactParameter);
}
const impactParameterError =
  Math.abs(criticalImpactParameter - SchwarzschildLimits.criticalImpactParameter) /
  SchwarzschildLimits.criticalImpactParameter;
check(
  "traced Schwarzschild shadow edge matches sqrt(27)M",
  impactParameterError < CriticalImpactParameterRelativeTolerance,
  `traced b = ${criticalImpactParameter}, relative error ${impactParameterError}`
);

// --- Kerr-Vaidya: null constraint holds while p_v evolves -----------------------
const accretingMassParameters: MassFunctionParameters = { initialMass: 1, accretionRate: 0.002, smoothingTime: 24 };
const accretingTrace = traceRay(0.82, accretingMassParameters, 20, {
  radial: -0.98,
  polar: 0,
  azimuthal: Math.sqrt(1 - 0.98 * 0.98)
}, 200000);
check(
  "accreting ray: p_v evolves (energy not conserved)",
  accretingTrace.maximumEnergyDrift > 1e-9,
  `drift ${accretingTrace.maximumEnergyDrift}`
);
check(
  "accreting ray: null constraint still preserved",
  accretingTrace.maximumNullDrift < NullDriftTolerance,
  `max drift ${accretingTrace.maximumNullDrift}`
);

// --- Timelike geodesics: Hamilton's equations vs finite differences --------------
function numericalHamiltonian(position: FourVector, momentum: FourVector, spin: number, massParameters: MassFunctionParameters): number {
  const raised = raiseMomentumIndex({ position, covariantMomentum: momentum }, spin, massParameters);
  return 0.5 * raised.reduce((total, component, index) => total + component * momentum[index], 0);
}

const worstDerivativeError = Math.max(
  ...Array.from({ length: 40 }, () => {
    const sample = randomSample();
    const tetrad = evaluateZeroAngularMomentumObserver(sample);
    const boost = 0.4 * (Math.random() - 0.5);
    const fourVelocity = tetrad.fourVelocity.map(
      (component, index) => (component + boost * tetrad.radialAxis[index] + 0.2 * boost * tetrad.azimuthalAxis[index]) /
        Math.sqrt(1 - boost * boost * 1.04)
    ) as FourVector;
    const metric = evaluateCovariantMetric(sample);
    const momentum = metric.map((row) =>
      row.reduce((total, component, columnIndex) => total + component * fourVelocity[columnIndex], 0)
    ) as FourVector;
    const state: GeodesicState = { position: [1, sample.radius, sample.polarAngle, 0.7], covariantMomentum: momentum };
    const parameters: MassFunctionParameters = { initialMass: sample.mass, accretionRate: 0.002, smoothingTime: 24 };
    const analytic = evaluateTimelikeDerivatives(state, sample.spin, parameters);
    const delta = 1e-6;
    return Math.max(
      ...([0, 1, 2, 3] as const).map((index) => {
        const positionPlus = [...state.position] as FourVector;
        positionPlus[index] += delta;
        const positionMinus = [...state.position] as FourVector;
        positionMinus[index] -= delta;
        const momentumGradient =
          (numericalHamiltonian(positionPlus, momentum, sample.spin, parameters) -
            numericalHamiltonian(positionMinus, momentum, sample.spin, parameters)) /
          (2 * delta);
        const momentumPlus = [...momentum] as FourVector;
        momentumPlus[index] += delta;
        const momentumMinus = [...momentum] as FourVector;
        momentumMinus[index] -= delta;
        const positionGradient =
          (numericalHamiltonian(state.position, momentumPlus, sample.spin, parameters) -
            numericalHamiltonian(state.position, momentumMinus, sample.spin, parameters)) /
          (2 * delta);
        return Math.max(
          Math.abs(analytic.position[index] - positionGradient),
          Math.abs(analytic.covariantMomentum[index] + momentumGradient)
        );
      })
    );
  })
);
check("timelike Hamilton equations match finite differences", worstDerivativeError < 2e-5, `max error ${worstDerivativeError}`);

// --- Timelike geodesics: Kerr circular orbit frequency ----------------------------
{
  const orbitSpin = 0.9;
  const orbitRadius = 8;
  const orbitalFrequency = Math.sqrt(1) / (Math.pow(orbitRadius, 1.5) + orbitSpin);
  const orbitSample: SpacetimeSample = { mass: 1, spin: orbitSpin, radius: orbitRadius, polarAngle: EquatorialPolarAngle };
  const orbitMetric = evaluateCovariantMetric(orbitSample);
  const circularDirection: FourVector = [1, 0, 0, orbitalFrequency];
  const norm = Math.sqrt(-contractWithMetric(orbitMetric, circularDirection, circularDirection));
  const fourVelocity = circularDirection.map((component) => component / norm) as FourVector;
  let orbitState: GeodesicState = {
    position: [0, orbitRadius, EquatorialPolarAngle, 0],
    covariantMomentum: orbitMetric.map((row) =>
      row.reduce((total, component, columnIndex) => total + component * fourVelocity[columnIndex], 0)
    ) as FourVector
  };
  const orbitParameters: MassFunctionParameters = { initialMass: 1, accretionRate: 0, smoothingTime: 24 };
  const properStep = 0.02;
  let maximumRadiusDrift = 0;
  while (orbitState.position[CoordinateIndex.AdvancedTime] < (2 * Math.PI) / orbitalFrequency) {
    orbitState = advanceTimelikeWorldline(orbitState, orbitSpin, orbitParameters, properStep);
    maximumRadiusDrift = Math.max(maximumRadiusDrift, Math.abs(orbitState.position[CoordinateIndex.Radius] - orbitRadius));
  }
  const azimuthalAdvance = orbitState.position[CoordinateIndex.AzimuthalAngle];
  check("Kerr circular orbit holds its radius", maximumRadiusDrift < 1e-4, `max drift ${maximumRadiusDrift}`);
  check(
    "Kerr circular orbit frequency matches Bardeen formula",
    Math.abs(azimuthalAdvance - 2 * Math.PI) < 0.02,
    `psi advance ${azimuthalAdvance} vs ${2 * Math.PI}`
  );
}

// --- Timelike geodesics: infall crosses the growing horizon regularly -------------
{
  const infallParameters: MassFunctionParameters = { initialMass: 1, accretionRate: 0.002, smoothingTime: 24 };
  const infallSpin = 0.82;
  const startSample: SpacetimeSample = { mass: 1, spin: infallSpin, radius: 6, polarAngle: EquatorialPolarAngle };
  const restingObserver = evaluateZeroAngularMomentumObserver(startSample);
  const startMetric = evaluateCovariantMetric(startSample);
  let infallState: GeodesicState = {
    position: [0, 6, EquatorialPolarAngle, 0],
    covariantMomentum: startMetric.map((row) =>
      row.reduce((total, component, columnIndex) => total + component * restingObserver.fourVelocity[columnIndex], 0)
    ) as FourVector
  };
  let crossedHorizon = false;
  let regular = true;
  for (let step = 0; step < 20000 && !crossedHorizon; step += 1) {
    infallState = advanceTimelikeWorldline(infallState, infallSpin, infallParameters, 0.005);
    const localMass = evaluateMassFunction(infallState.position[CoordinateIndex.AdvancedTime], infallParameters).mass;
    if (!infallState.position.every(Number.isFinite)) regular = false;
    if (infallState.position[CoordinateIndex.Radius] < 0.9 * evaluateOuterKerrRadius(localMass, infallSpin)) {
      crossedHorizon = true;
    }
  }
  check(
    "free fall crosses the horizon with finite coordinates",
    crossedHorizon && regular && Number.isFinite(infallState.position[CoordinateIndex.AdvancedTime]),
    `r ${infallState.position[CoordinateIndex.Radius]}, v ${infallState.position[CoordinateIndex.AdvancedTime]}`
  );

  const tetradAtCrossing = buildOrthonormalTetrad(
    {
      mass: evaluateMassFunction(infallState.position[CoordinateIndex.AdvancedTime], infallParameters).mass,
      spin: infallSpin,
      radius: infallState.position[CoordinateIndex.Radius],
      polarAngle: infallState.position[CoordinateIndex.PolarAngle]
    },
    raiseMomentumIndex(infallState, infallSpin, infallParameters)
  );
  const crossingMetric = evaluateCovariantMetric({
    mass: evaluateMassFunction(infallState.position[CoordinateIndex.AdvancedTime], infallParameters).mass,
    spin: infallSpin,
    radius: infallState.position[CoordinateIndex.Radius],
    polarAngle: infallState.position[CoordinateIndex.PolarAngle]
  });
  const axes = [tetradAtCrossing.fourVelocity, tetradAtCrossing.radialAxis, tetradAtCrossing.polarAxis, tetradAtCrossing.azimuthalAxis];
  const minkowskiDiagonal = [-1, 1, 1, 1];
  const worstInteriorTetradError = Math.max(
    ...axes.map((left, leftIndex) =>
      Math.max(
        ...axes.map((right, rightIndex) =>
          Math.abs(contractWithMetric(crossingMetric, left, right) - (leftIndex === rightIndex ? minkowskiDiagonal[leftIndex] : 0))
        )
      )
    )
  );
  check(
    "infalling tetrad stays orthonormal inside the horizon",
    worstInteriorTetradError < 1e-8,
    `max error ${worstInteriorTetradError}`
  );
}

// --- Apparent horizon vs Dahal & Terno 2020 Fig. 1 ------------------------------
const horizonSolution = solveApparentHorizon(1, 0.1, 0.01);
const equatorialCorrection = horizonSolution.samples[Math.floor(horizonSolution.samples.length / 2)].correction;
check(
  "apparent horizon sits inside r0 for accretion (2025 Eq. 15)",
  equatorialCorrection < 0,
  `z(pi/2) = ${equatorialCorrection}`
);
check(
  "apparent horizon correction magnitude matches 2020 Fig. 1",
  Math.abs(Math.abs(equatorialCorrection) - HorizonCorrectionExpected) / HorizonCorrectionExpected <
    HorizonCorrectionRelativeTolerance,
  `|z(pi/2)| = ${Math.abs(equatorialCorrection)}, expected ~${HorizonCorrectionExpected}`
);
const poleCorrections = [horizonSolution.samples[0].correction, horizonSolution.samples.at(-1)?.correction ?? NaN];
check("apparent horizon correction vanishes at the poles", poleCorrections.every((value) => value === 0), `${poleCorrections}`);

// --- Kerr horizon mechanics -------------------------------------------------------
{
  const schwarzschild = evaluateHorizonThermodynamics(1, 0);
  check(
    "Schwarzschild surface gravity 1/4M and temperature 1/8piM",
    Math.abs(schwarzschild.surfaceGravity - 0.25) < 1e-12 &&
      Math.abs(schwarzschild.hawkingTemperature - 1 / (8 * Math.PI)) < 1e-12,
    `kappa ${schwarzschild.surfaceGravity}, T ${schwarzschild.hawkingTemperature}`
  );
  check(
    "Schwarzschild irreducible mass equals M and entropy A/4",
    Math.abs(schwarzschild.irreducibleMass - 1) < 1e-12 &&
      Math.abs(schwarzschild.bekensteinHawkingEntropy - schwarzschild.area / 4) < 1e-12,
    `M_irr ${schwarzschild.irreducibleMass}, S ${schwarzschild.bekensteinHawkingEntropy}`
  );
  const spinning = evaluateHorizonThermodynamics(1, 0.7);
  check(
    "Kerr horizon angular velocity equals a/2Mr_+",
    Math.abs(spinning.angularVelocity - 0.7 / (2 * spinning.outerRadius)) < 1e-12,
    `Omega ${spinning.angularVelocity}`
  );
  const massStep = 1e-6;
  const numericalGrowth =
    (evaluateHorizonThermodynamics(1 + massStep, 0.7).outerRadius -
      evaluateHorizonThermodynamics(1 - massStep, 0.7).outerRadius) /
    (2 * massStep);
  check(
    "horizon growth per unit mass matches dr_+/dM",
    Math.abs(spinning.radiusGrowthPerUnitMass - numericalGrowth) < 1e-6,
    `analytic ${spinning.radiusGrowthPerUnitMass}, numeric ${numericalGrowth}`
  );
}

// --- Fluid vortex analogue --------------------------------------------------------
const analogueConfiguration: AnalogueMappingConfiguration = {
  referenceSonicHorizonRadiusMetres: 0.03,
  layerDepthMetres: 0.0625,
  tankRadiusMetres: 0.6,
  matchedInvariant: AnalogueMatchingInvariant.HorizonAngularVelocity
};
const analogueMassParameters: MassFunctionParameters = { initialMass: 1, accretionRate: 0.002, smoothingTime: 24 };

{
  const staticState = evaluateFluidVortexAnalogue(
    evaluateMassFunction(0, { ...analogueMassParameters, accretionRate: 0 }),
    0,
    1,
    analogueConfiguration
  );
  check(
    "non-rotating hole maps to a pure sink (no circulation)",
    staticState.flow.circulationStrength === 0 && staticState.geometry.ergosurfaceRadiusMetres === staticState.geometry.sonicHorizonRadiusMetres,
    `C ${staticState.flow.circulationStrength}, r_ergo ${staticState.geometry.ergosurfaceRadiusMetres}`
  );
  check(
    "sonic horizon lands where the apparatus was anchored",
    Math.abs(staticState.geometry.sonicHorizonRadiusMetres - analogueConfiguration.referenceSonicHorizonRadiusMetres) < 1e-12,
    `r_h ${staticState.geometry.sonicHorizonRadiusMetres}`
  );
  check(
    "analogue surface gravity is c/r_h and wave speed is sqrt(g h)",
    Math.abs(
      staticState.thermodynamics.surfaceGravityPerSecond -
        staticState.unitScaling.waveSpeedMetresPerSecond / staticState.geometry.sonicHorizonRadiusMetres
    ) < 1e-12 &&
      Math.abs(staticState.unitScaling.waveSpeedMetresPerSecond - Math.sqrt(9.80665 * 0.0625)) < 1e-12,
    `kappa ${staticState.thermodynamics.surfaceGravityPerSecond}, c ${staticState.unitScaling.waveSpeedMetresPerSecond}`
  );
  check(
    "Schwarzschild analogue runs exactly twice as hot per horizon radius",
    Math.abs(staticState.fidelity.surfaceGravityRatio - 2) < 1e-9,
    `ratio ${staticState.fidelity.surfaceGravityRatio}`
  );
}

{
  const spinningMass = evaluateMassFunction(0, analogueMassParameters);
  const angularVelocityMatched = evaluateFluidVortexAnalogue(spinningMass, 0.82, 1, analogueConfiguration);
  const ergosphereMatched = evaluateFluidVortexAnalogue(spinningMass, 0.82, 1, {
    ...analogueConfiguration,
    matchedInvariant: AnalogueMatchingInvariant.ErgosphereRadiusRatio
  });
  check(
    "the selected invariant is matched exactly and the other is not",
    Math.abs(angularVelocityMatched.fidelity.horizonAngularVelocityResidual) < 1e-12 &&
      Math.abs(angularVelocityMatched.fidelity.ergosphereRadiusRatioResidual) > 1e-3 &&
      Math.abs(ergosphereMatched.fidelity.ergosphereRadiusRatioResidual) < 1e-12 &&
      Math.abs(ergosphereMatched.fidelity.horizonAngularVelocityResidual) > 1e-3,
    `angular-velocity residuals ${angularVelocityMatched.fidelity.horizonAngularVelocityResidual}, ` +
      `${angularVelocityMatched.fidelity.ergosphereRadiusRatioResidual}; ` +
      `ergosphere residuals ${ergosphereMatched.fidelity.ergosphereRadiusRatioResidual}, ` +
      `${ergosphereMatched.fidelity.horizonAngularVelocityResidual}`
  );
  const kerrHorizon = evaluateHorizonThermodynamics(spinningMass.mass, 0.82);
  const dimensionlessFluidAngularVelocity =
    (angularVelocityMatched.geometry.horizonAngularVelocityRadiansPerSecond *
      angularVelocityMatched.geometry.sonicHorizonRadiusMetres) /
    angularVelocityMatched.unitScaling.waveSpeedMetresPerSecond;
  check(
    "matched vortex reproduces the dimensionless Kerr frame-dragging rate",
    Math.abs(dimensionlessFluidAngularVelocity - kerrHorizon.angularVelocity * kerrHorizon.outerRadius) < 1e-12,
    `fluid ${dimensionlessFluidAngularVelocity}, Kerr ${kerrHorizon.angularVelocity * kerrHorizon.outerRadius}`
  );
  check(
    "ergosurface encloses the sonic horizon whenever the hole spins",
    ergosphereMatched.geometry.ergosurfaceRadiusMetres > ergosphereMatched.geometry.sonicHorizonRadiusMetres &&
      ergosphereMatched.validity.ergosurfaceFitsInsideTank,
    `r_ergo ${ergosphereMatched.geometry.ergosurfaceRadiusMetres}, r_h ${ergosphereMatched.geometry.sonicHorizonRadiusMetres}`
  );
  check(
    "superradiance thresholds are m x the horizon rotation frequency",
    ergosphereMatched.thermodynamics.superradianceThresholdFrequenciesHertz.every(
      (frequency, index) =>
        Math.abs(
          frequency -
            ((index + 1) * ergosphereMatched.geometry.horizonAngularVelocityRadiansPerSecond) / (2 * Math.PI)
        ) < 1e-12
    ),
    `${ergosphereMatched.thermodynamics.superradianceThresholdFrequenciesHertz}`
  );
}

{
  const shallowWaterSpeed = Math.sqrt(9.80665 * 0.0625);
  const longWave = evaluateSurfaceWaveDispersion(0.05, 0.0625);
  check(
    "surface wave dispersion reduces to sqrt(g h) at long wavelength",
    Math.abs(longWave.phaseSpeedMetresPerSecond - shallowWaterSpeed) / shallowWaterSpeed < 1e-4 &&
      Math.abs(longWave.shallowWaterSpeedRatio - 1) < 1e-4,
    `c_phase ${longWave.phaseSpeedMetresPerSecond} vs ${shallowWaterSpeed}`
  );
  // The ceiling has to be a frequency that is genuinely still in band: at its
  // shallow-water wavenumber the true phase speed must sit inside the 5% tolerance
  // the band is defined by. Deepening the layer must lower it.
  const shallowCeiling = evaluateNondispersiveCeilingFrequency(0.01);
  const deepCeiling = evaluateNondispersiveCeilingFrequency(0.0625);
  const speedRatioAtCeiling = (depth: number, ceilingFrequency: number) =>
    evaluateSurfaceWaveDispersion(
      (2 * Math.PI * ceilingFrequency) / Math.sqrt(9.80665 * depth),
      depth
    ).shallowWaterSpeedRatio;
  check(
    "the non-dispersive ceiling is still in band and falls with depth",
    shallowCeiling > deepCeiling &&
      Math.abs(speedRatioAtCeiling(0.01, shallowCeiling) - 1) < NondispersiveBandTolerance &&
      Math.abs(speedRatioAtCeiling(0.0625, deepCeiling) - 1) < NondispersiveBandTolerance,
    `${shallowCeiling} Hz (ratio ${speedRatioAtCeiling(0.01, shallowCeiling)}), ` +
      `${deepCeiling} Hz (ratio ${speedRatioAtCeiling(0.0625, deepCeiling)})`
  );
  check(
    "the 3.7 Hz probe of Torres et al. 2016 sits above the shallow-water band in 6.25 cm",
    deepCeiling < 3.7,
    `ceiling ${deepCeiling} Hz`
  );
}

{
  const rates = evaluateFluidVortexAnalogueRates(12, 0.82, analogueMassParameters, analogueConfiguration);
  const secondsPerAdvancedTime = evaluateFluidVortexAnalogue(
    evaluateMassFunction(12, analogueMassParameters),
    0.82,
    1,
    analogueConfiguration
  ).unitScaling.secondsPerGeometrizedTime;
  const advancedTimeStep = 1e-4;
  const drainAt = (advancedTime: number) =>
    evaluateFluidVortexAnalogue(
      evaluateMassFunction(advancedTime, analogueMassParameters),
      0.82,
      1,
      analogueConfiguration
    ).flow.drainStrength;
  const numericalDrainRate =
    (drainAt(12 + advancedTimeStep) - drainAt(12 - advancedTimeStep)) / (2 * advancedTimeStep * secondsPerAdvancedTime);
  check(
    "accretion ramps the drain: dD/dt matches a direct difference and is positive",
    rates.drainStrengthRate > 0 &&
      Math.abs(rates.drainStrengthRate - numericalDrainRate) / numericalDrainRate < 1e-4,
    `analytic ${rates.drainStrengthRate}, numeric ${numericalDrainRate}`
  );
  check(
    "accretion grows the vortex while spinning it down (C/D falls, C and D both rise)",
    rates.circulationStrengthToDrainRatioRate < 0 &&
      rates.circulationStrengthRate > 0 &&
      rates.sonicHorizonRadiusRateMetresPerSecond > 0,
    `d(C/D)/dt ${rates.circulationStrengthToDrainRatioRate}, dC/dt ${rates.circulationStrengthRate}, ` +
      `dr_h/dt ${rates.sonicHorizonRadiusRateMetresPerSecond}`
  );
}

// --------------------------------------------------------------------------------
if (failures.length > 0) {
  console.error(`\n${failures.length} check(s) failed`);
  process.exit(1);
}
console.log("\nall physics checks passed");
