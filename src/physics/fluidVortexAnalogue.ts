import { evaluateHorizonThermodynamics } from "./kerrVaidyaGeometry.ts";
import { evaluateMassFunction, type MassFunctionParameters, type MassState } from "./massFunction.ts";

// The laboratory counterpart of the ingoing Kerr-Vaidya black hole: a draining
// bathtub vortex — a shallow layer of water of undisturbed depth h with a point drain
// and circulation at the origin, so the background flow is
//
//   v = -(D / r) rhat + (C / r) psihat,        D, C > 0  [m^2/s]
//
// Long-wavelength surface perturbations of that flow obey a massless Klein-Gordon
// equation on the effective Lorentzian geometry (Unruh 1981; Visser gr-qc/9712010)
//
//   ds^2 = -(c^2 - (C^2 + D^2)/r^2) dt^2 - 2(D/r) dr dt - 2 C dpsi dt + dr^2 + r^2 dpsi^2
//
// with the shallow-water wave speed c = sqrt(g h) playing the role of the speed of
// light. This geometry has a horizon, an ergoregion, frame dragging, superradiance
// and quasinormal ringing, and is "the closest analogue found so far to the Kerr black
// hole" (Cardoso, Lemos & Yoshida gr-qc/0410107). It is NOT isometric to Kerr, so the
// mapping below matches a chosen set of dimensionless invariants exactly and reports
// the residual mismatch in the rest — see `fidelity`.
//
// What makes the correspondence Kerr-VAIDYA rather than Kerr is that M(v) grows: the
// sonic horizon in the tank has to grow with it, which means the drain rate and the
// circulation must both be ramped on a schedule. Those ramps are the experiment.
//
// Everything in this file is pure. Lab quantities are SI unless the name says
// otherwise; simulation quantities are geometrized (G = c = 1, mass unit = M).

export const WorkingFluidProperties = {
  gravitationalAcceleration: 9.80665,
  massDensity: 998.2,
  kinematicViscosity: 1.0034e-6,
  surfaceTension: 0.0728
} as const;

const ReducedPlanckConstant = 1.054571817e-34;
const BoltzmannConstant = 1.380649e-23;
const LitresPerCubicMetre = 1000;
const SecondsPerMinute = 60;

// Which dimensionless Kerr invariant the single shape parameter C/D is tuned to
// reproduce. The draining bathtub has exactly one shape freedom, so exactly one of
// these can be matched; the other is reported as a residual.
export const AnalogueMatchingInvariant = {
  HorizonAngularVelocity: "horizon-angular-velocity",
  ErgosphereRadiusRatio: "ergosphere-radius-ratio"
} as const;
export type AnalogueMatchingInvariant =
  (typeof AnalogueMatchingInvariant)[keyof typeof AnalogueMatchingInvariant];

export interface AnalogueMappingConfiguration {
  // Where the sonic horizon would sit in the tank for a hole of the initial mass M0.
  // This is the ruler that fixes the length scale and it never moves; the horizon
  // grows past it, and since M(v) already exceeds M0 by v = 0 the run starts with the
  // horizon slightly outside this radius.
  referenceSonicHorizonRadiusMetres: number;
  // Undisturbed depth of the water layer: sets the wave speed sqrt(g h), hence the
  // analogue speed of light and the whole time scale.
  layerDepthMetres: number;
  tankRadiusMetres: number;
  matchedInvariant: AnalogueMatchingInvariant;
}

export interface AnalogueUnitScaling {
  metresPerGeometrizedLength: number;
  secondsPerGeometrizedTime: number;
  waveSpeedMetresPerSecond: number;
}

export interface DrainingVortexFlow {
  drainStrength: number;
  circulationStrength: number;
  circulationStrengthToDrainRatio: number;
  volumetricDrainRateCubicMetresPerSecond: number;
  volumetricDrainRateLitresPerMinute: number;
  circulationMetresSquaredPerSecond: number;
  radialSpeedAtHorizonMetresPerSecond: number;
  tangentialSpeedAtHorizonMetresPerSecond: number;
}

export interface AnalogueEffectiveGeometry {
  sonicHorizonRadiusMetres: number;
  ergosurfaceRadiusMetres: number;
  ergosurfaceToHorizonRatio: number;
  horizonAngularVelocityRadiansPerSecond: number;
}

export interface AnalogueHorizonThermodynamics {
  surfaceGravityPerSecond: number;
  hawkingFrequencyHertz: number;
  hawkingTemperatureKelvin: number;
  superradianceThresholdFrequenciesHertz: number[];
}

export interface AnalogueValidityDiagnostics {
  reynoldsNumber: number;
  froudeNumberAtTankRadius: number;
  shallowWaterRatioAtHorizon: number;
  // Bernoulli dip of the free surface at the sonic horizon, and that dip as a
  // fraction of the undisturbed depth. The flow speed at the horizon is sqrt(g h) by
  // definition, so the fraction is always (1 + (C/D)^2)/2 — no apparatus can tune it
  // below about a half. It is a prediction to measure with a depth gauge, not a knob:
  // the constant-depth idealization behind the effective metric is never better than
  // this near the core, which is why real rigs feed a measured depth profile back in.
  freeSurfaceDepressionAtHorizonMetres: number;
  depthVariationFractionAtHorizon: number;
  capillaryLengthMetres: number;
  nondispersiveCeilingFrequencyHertz: number;
  ergosurfaceFitsInsideTank: boolean;
  superradianceBandFitsNondispersiveWindow: boolean;
}

// How far the draining bathtub is from the Kerr hole it is standing in for. The
// matched invariant's residual is zero by construction; the others are the honest
// cost of the analogy.
export interface AnalogueFidelityResiduals {
  ergosphereRadiusRatioResidual: number;
  horizonAngularVelocityResidual: number;
  surfaceGravityRatio: number;
}

export interface FluidVortexAnalogueState {
  matchedInvariant: AnalogueMatchingInvariant;
  unitScaling: AnalogueUnitScaling;
  flow: DrainingVortexFlow;
  geometry: AnalogueEffectiveGeometry;
  thermodynamics: AnalogueHorizonThermodynamics;
  validity: AnalogueValidityDiagnostics;
  fidelity: AnalogueFidelityResiduals;
}

// The driving schedule the pumps have to follow while M(v) grows: everything here is
// per second of laboratory time.
export interface FluidVortexAnalogueRates {
  sonicHorizonRadiusRateMetresPerSecond: number;
  drainStrengthRate: number;
  circulationStrengthRate: number;
  // Negative under accretion: at fixed a a growing M is a spin-down in the only
  // dimensionless sense the vortex can see, so the circulation has to be ramped more
  // slowly than the drain even though both increase.
  circulationStrengthToDrainRatioRate: number;
  volumetricDrainRateRateLitresPerMinutePerSecond: number;
  circulationRate: number;
  horizonAngularVelocityRate: number;
}

const SuperradianceAzimuthalNumbers = [1, 2, 3] as const;
const PhaseSpeedToleranceForNondispersiveBand = 0.05;
const DispersionScanMinimumWaveNumber = 1e-3;
const DispersionScanMaximumWaveNumber = 4000;
const DispersionScanSampleCount = 512;
const DispersionBisectionIterations = 60;
const AdvancedTimeRateStep = 1e-3;

export interface SurfaceWaveDispersion {
  angularFrequencyRadiansPerSecond: number;
  frequencyHertz: number;
  phaseSpeedMetresPerSecond: number;
  groupSpeedMetresPerSecond: number;
  shallowWaterSpeedRatio: number;
}

// Full gravity-capillary dispersion in finite depth. The analogue only holds where
// this collapses to the non-dispersive shallow-water speed sqrt(g h), so the probe
// wavelengths a contributor may use are bounded by how far the ratio below drifts
// from one.
export function evaluateSurfaceWaveDispersion(
  waveNumberPerMetre: number,
  layerDepthMetres: number
): SurfaceWaveDispersion {
  const { gravitationalAcceleration, massDensity, surfaceTension } = WorkingFluidProperties;
  const capillaryStiffness = surfaceTension / massDensity;
  const depthFactor = Math.tanh(waveNumberPerMetre * layerDepthMetres);
  const restoringTerm = gravitationalAcceleration * waveNumberPerMetre + capillaryStiffness * waveNumberPerMetre ** 3;
  const angularFrequency = Math.sqrt(restoringTerm * depthFactor);
  const restoringGradient =
    (gravitationalAcceleration + 3 * capillaryStiffness * waveNumberPerMetre ** 2) * depthFactor +
    restoringTerm * layerDepthMetres * (1 - depthFactor * depthFactor);

  return {
    angularFrequencyRadiansPerSecond: angularFrequency,
    frequencyHertz: angularFrequency / (2 * Math.PI),
    phaseSpeedMetresPerSecond: angularFrequency / waveNumberPerMetre,
    groupSpeedMetresPerSecond: restoringGradient / (2 * Math.max(angularFrequency, Number.MIN_VALUE)),
    shallowWaterSpeedRatio:
      angularFrequency /
      (waveNumberPerMetre * Math.sqrt(gravitationalAcceleration * layerDepthMetres))
  };
}

// Highest probe frequency whose phase speed still sits within the tolerance of
// sqrt(g h). The ratio is not monotone — finite depth slows waves down while surface
// tension speeds them back up past the capillary scale — so the band edge is found by
// scanning a geometric wavenumber ladder for the first excursion and bisecting there,
// not by bisecting the whole range.
export function evaluateNondispersiveCeilingFrequency(layerDepthMetres: number): number {
  const isInBand = (waveNumber: number) =>
    Math.abs(evaluateSurfaceWaveDispersion(waveNumber, layerDepthMetres).shallowWaterSpeedRatio - 1) <
    PhaseSpeedToleranceForNondispersiveBand;
  const ladderRatio =
    (DispersionScanMaximumWaveNumber / DispersionScanMinimumWaveNumber) ** (1 / (DispersionScanSampleCount - 1));
  const ladder = Array.from(
    { length: DispersionScanSampleCount },
    (_, index) => DispersionScanMinimumWaveNumber * ladderRatio ** index
  );
  const firstOutOfBandIndex = ladder.findIndex((waveNumber) => !isInBand(waveNumber));
  if (firstOutOfBandIndex < 0) {
    return evaluateSurfaceWaveDispersion(DispersionScanMaximumWaveNumber, layerDepthMetres).frequencyHertz;
  }

  const bracket = Array.from({ length: DispersionBisectionIterations }).reduce(
    ({ inBand, outOfBand }) => {
      const midpoint = (inBand + outOfBand) / 2;
      return isInBand(midpoint) ? { inBand: midpoint, outOfBand } : { inBand, outOfBand: midpoint };
    },
    { inBand: ladder[Math.max(firstOutOfBandIndex - 1, 0)], outOfBand: ladder[firstOutOfBandIndex] }
  );
  return evaluateSurfaceWaveDispersion(bracket.inBand, layerDepthMetres).frequencyHertz;
}

// C/D, the only shape freedom of the draining bathtub. Both branches vanish for a
// non-rotating hole and grow with spin, but they disagree badly near extremality
// (1/2 versus sqrt(3) at a = M) — which is exactly why the unmatched one is reported.
function evaluateCirculationToDrainRatio(
  mass: number,
  spin: number,
  outerHorizonRadius: number,
  matchedInvariant: AnalogueMatchingInvariant
): number {
  if (matchedInvariant === AnalogueMatchingInvariant.HorizonAngularVelocity) {
    return Math.abs(spin) / (2 * mass);
  }
  const kerrErgosphereRatio = (2 * mass) / outerHorizonRadius;
  return Math.sqrt(Math.max(kerrErgosphereRatio * kerrErgosphereRatio - 1, 0));
}

export function evaluateFluidVortexAnalogue(
  massState: MassState,
  spin: number,
  referenceMass: number,
  configuration: AnalogueMappingConfiguration
): FluidVortexAnalogueState {
  const { gravitationalAcceleration, massDensity, kinematicViscosity, surfaceTension } = WorkingFluidProperties;
  const { referenceSonicHorizonRadiusMetres, layerDepthMetres, tankRadiusMetres, matchedInvariant } = configuration;

  const waveSpeed = Math.sqrt(gravitationalAcceleration * layerDepthMetres);
  // The apparatus is built once, so the ruler is anchored at the initial mass: as
  // M(v) grows the sonic horizon marches outward across a tank of fixed size.
  const metresPerGeometrizedLength =
    referenceSonicHorizonRadiusMetres / evaluateHorizonThermodynamics(referenceMass, spin).outerRadius;
  const horizon = evaluateHorizonThermodynamics(massState.mass, spin);
  const sonicHorizonRadius = metresPerGeometrizedLength * horizon.outerRadius;

  const circulationToDrainRatio = evaluateCirculationToDrainRatio(
    massState.mass,
    spin,
    horizon.outerRadius,
    matchedInvariant
  );
  const drainStrength = waveSpeed * sonicHorizonRadius;
  const circulationStrength = circulationToDrainRatio * drainStrength;
  const totalSpecificSpeed = Math.hypot(circulationStrength, drainStrength);
  const ergosurfaceRadius = totalSpecificSpeed / waveSpeed;
  const horizonAngularVelocity = circulationStrength / (sonicHorizonRadius * sonicHorizonRadius);
  const surfaceGravity = waveSpeed / sonicHorizonRadius;

  const freeSurfaceDepressionAtHorizon =
    (totalSpecificSpeed * totalSpecificSpeed) / (2 * gravitationalAcceleration * sonicHorizonRadius ** 2);
  const nondispersiveCeilingFrequency = evaluateNondispersiveCeilingFrequency(layerDepthMetres);
  const superradianceThresholdFrequencies = SuperradianceAzimuthalNumbers.map(
    (azimuthalNumber) => (azimuthalNumber * horizonAngularVelocity) / (2 * Math.PI)
  );

  return {
    matchedInvariant,
    unitScaling: {
      metresPerGeometrizedLength,
      secondsPerGeometrizedTime: metresPerGeometrizedLength / waveSpeed,
      waveSpeedMetresPerSecond: waveSpeed
    },
    flow: {
      drainStrength,
      circulationStrength,
      circulationStrengthToDrainRatio: circulationToDrainRatio,
      volumetricDrainRateCubicMetresPerSecond: 2 * Math.PI * layerDepthMetres * drainStrength,
      volumetricDrainRateLitresPerMinute:
        2 * Math.PI * layerDepthMetres * drainStrength * LitresPerCubicMetre * SecondsPerMinute,
      circulationMetresSquaredPerSecond: 2 * Math.PI * circulationStrength,
      radialSpeedAtHorizonMetresPerSecond: drainStrength / sonicHorizonRadius,
      tangentialSpeedAtHorizonMetresPerSecond: circulationStrength / sonicHorizonRadius
    },
    geometry: {
      sonicHorizonRadiusMetres: sonicHorizonRadius,
      ergosurfaceRadiusMetres: ergosurfaceRadius,
      ergosurfaceToHorizonRatio: ergosurfaceRadius / sonicHorizonRadius,
      horizonAngularVelocityRadiansPerSecond: horizonAngularVelocity
    },
    thermodynamics: {
      surfaceGravityPerSecond: surfaceGravity,
      hawkingFrequencyHertz: surfaceGravity / (2 * Math.PI),
      hawkingTemperatureKelvin: (ReducedPlanckConstant * surfaceGravity) / (2 * Math.PI * BoltzmannConstant),
      superradianceThresholdFrequenciesHertz: superradianceThresholdFrequencies
    },
    validity: {
      // |v| r is radius-independent for this flow, so one Reynolds number covers it.
      reynoldsNumber: totalSpecificSpeed / kinematicViscosity,
      froudeNumberAtTankRadius: sonicHorizonRadius / tankRadiusMetres,
      shallowWaterRatioAtHorizon: layerDepthMetres / sonicHorizonRadius,
      freeSurfaceDepressionAtHorizonMetres: freeSurfaceDepressionAtHorizon,
      depthVariationFractionAtHorizon: freeSurfaceDepressionAtHorizon / layerDepthMetres,
      capillaryLengthMetres: Math.sqrt(surfaceTension / (massDensity * gravitationalAcceleration)),
      nondispersiveCeilingFrequencyHertz: nondispersiveCeilingFrequency,
      ergosurfaceFitsInsideTank: ergosurfaceRadius < tankRadiusMetres,
      superradianceBandFitsNondispersiveWindow:
        superradianceThresholdFrequencies.every((frequency) => frequency < nondispersiveCeilingFrequency)
    },
    fidelity: {
      ergosphereRadiusRatioResidual:
        Math.sqrt(1 + circulationToDrainRatio * circulationToDrainRatio) - (2 * massState.mass) / horizon.outerRadius,
      horizonAngularVelocityResidual: circulationToDrainRatio - Math.abs(spin) / (2 * massState.mass),
      // kappa r_h / c is identically 1 for the draining bathtub but (r_+ - r_-)/4M
      // for Kerr, so the analogue always runs hot — by a factor of 2 at zero spin,
      // diverging at extremality. No choice of C/D can fix this.
      surfaceGravityRatio: 1 / (horizon.surfaceGravity * horizon.outerRadius)
    }
  };
}

// Differentiated in advanced time and converted to laboratory seconds, so the result
// is the pump schedule directly. Central differences keep this exact to O(step^2)
// against any future mass function without re-deriving the algebra.
export function evaluateFluidVortexAnalogueRates(
  advancedTime: number,
  spin: number,
  massParameters: MassFunctionParameters,
  configuration: AnalogueMappingConfiguration
): FluidVortexAnalogueRates {
  const sampleAt = (offset: number) =>
    evaluateFluidVortexAnalogue(
      evaluateMassFunction(advancedTime + offset, massParameters),
      spin,
      massParameters.initialMass,
      configuration
    );
  const before = sampleAt(-AdvancedTimeRateStep);
  const after = sampleAt(AdvancedTimeRateStep);
  const secondsPerStep = 2 * AdvancedTimeRateStep * after.unitScaling.secondsPerGeometrizedTime;
  const rateOf = (read: (state: FluidVortexAnalogueState) => number) =>
    (read(after) - read(before)) / secondsPerStep;

  return {
    sonicHorizonRadiusRateMetresPerSecond: rateOf((state) => state.geometry.sonicHorizonRadiusMetres),
    drainStrengthRate: rateOf((state) => state.flow.drainStrength),
    circulationStrengthRate: rateOf((state) => state.flow.circulationStrength),
    circulationStrengthToDrainRatioRate: rateOf((state) => state.flow.circulationStrengthToDrainRatio),
    volumetricDrainRateRateLitresPerMinutePerSecond: rateOf(
      (state) => state.flow.volumetricDrainRateLitresPerMinute
    ),
    circulationRate: rateOf((state) => state.flow.circulationMetresSquaredPerSecond),
    horizonAngularVelocityRate: rateOf((state) => state.geometry.horizonAngularVelocityRadiansPerSecond)
  };
}
