import {
  CoordinateIndex,
  evaluateErgosphereRadius,
  evaluateHorizonThermodynamics,
  evaluateInnermostStableCircularOrbitRadius,
  evaluatePhotonOrbitRadii,
  evaluateShadowImpactParameters,
  raiseMomentumIndex,
  type GeodesicState
} from "../physics/kerrVaidyaGeometry.ts";
import {
  evaluateFluidVortexAnalogue,
  evaluateFluidVortexAnalogueRates,
  type AnalogueMappingConfiguration
} from "../physics/fluidVortexAnalogue.ts";
import type { ApparentHorizonSolution } from "../physics/apparentHorizon.ts";
import type { MassState } from "../physics/massFunction.ts";
import type { ObserverUniformState } from "../observer/physicalObserver.ts";
import type { RecordingReadout, SimulationReadout } from "../contributorApi.ts";
import type { SimulationState } from "../types.ts";

// The one place a frame's worth of physics is turned into numbers. Both consumers of
// those numbers — the contributor panels and the JSONL recorder — read this and
// nothing else, so a quantity that is plotted is a quantity that was displayed.

export interface SimulationFrameInput {
  simulation: SimulationState;
  massState: MassState;
  apparentHorizon: ApparentHorizonSolution;
  observer: ObserverUniformState;
  // Absent while paused: there is no worldline, so the conserved charges below are
  // reported for a momentarily-at-rest observer instead.
  worldline: GeodesicState | null;
  properTimeElapsed: number;
  insideHorizon: boolean;
  journeyEnded: boolean;
  verticalFov: number;
  rendering: {
    frameMilliseconds: number;
    renderScale: number;
    framebufferWidth: number;
    framebufferHeight: number;
    accumulatedStaticFrames: number;
  };
  recording: RecordingReadout;
}

export function analogueConfigurationOf(simulation: SimulationState): AnalogueMappingConfiguration {
  return {
    referenceSonicHorizonRadiusMetres: simulation.laboratoryHorizonRadiusMetres,
    layerDepthMetres: simulation.laboratoryLayerDepthMetres,
    tankRadiusMetres: simulation.laboratoryTankRadiusMetres,
    matchedInvariant: simulation.analogueMatchedInvariant
  };
}

// Carter's constant for the Kerr Killing tower. Exactly conserved along Kerr
// geodesics; its drift under M(v) is the cleanest single scalar signature of the
// Vaidya term, so it is worth a column of its own.
function evaluateCarterConstant(state: GeodesicState, spin: number): number {
  const polarAngle = state.position[CoordinateIndex.PolarAngle];
  const [timeMomentum, , polarMomentum, azimuthalMomentum] = state.covariantMomentum;
  const cosineSquared = Math.cos(polarAngle) ** 2;
  const sineSquared = Math.max(Math.sin(polarAngle) ** 2, Number.EPSILON);
  return (
    polarMomentum * polarMomentum +
    cosineSquared * (spin * spin * (1 - timeMomentum * timeMomentum) + (azimuthalMomentum * azimuthalMomentum) / sineSquared)
  );
}

export function buildSimulationFrameState(input: SimulationFrameInput): SimulationReadout {
  const { simulation, massState, apparentHorizon, observer, worldline } = input;
  const { mass, massDerivative, advancedTime } = massState;
  const horizon = evaluateHorizonThermodynamics(mass, simulation.spin);
  const equatorialSample = apparentHorizon.samples[Math.floor(apparentHorizon.samples.length / 2)];

  const radius = observer.cameraCoordinates[CoordinateIndex.Radius];
  const polarAngle = observer.cameraCoordinates[CoordinateIndex.PolarAngle];
  const contravariantVelocity = worldline
    ? raiseMomentumIndex(worldline, simulation.spin, simulation)
    : [1, 0, 0, 0];
  const covariantMomentum = worldline?.covariantMomentum ?? [0, 0, 0, 0];

  const analogueConfiguration = analogueConfigurationOf(simulation);

  return {
    advancedTime,
    paused: simulation.paused,
    blackHole: {
      mass,
      massDerivative,
      spin: simulation.spin,
      spinToMassRatio: simulation.spin / mass,
      angularMomentum: horizon.angularMomentum,
      outerHorizonRadius: horizon.outerRadius,
      innerHorizonRadius: horizon.innerRadius,
      apparentHorizonEquatorialRadius: equatorialSample.radius,
      apparentHorizonMaximumCorrection: apparentHorizon.maximumCorrection,
      horizonRadiusGrowthRate: horizon.radiusGrowthPerUnitMass * massDerivative,
      horizonArea: horizon.area,
      irreducibleMass: horizon.irreducibleMass,
      bekensteinHawkingEntropy: horizon.bekensteinHawkingEntropy,
      surfaceGravity: horizon.surfaceGravity,
      hawkingTemperature: horizon.hawkingTemperature,
      horizonAngularVelocity: horizon.angularVelocity,
      ergosphereEquatorialRadius: evaluateErgosphereRadius(mass, simulation.spin, Math.PI / 2),
      photonOrbitRadii: evaluatePhotonOrbitRadii(mass, simulation.spin),
      innermostStableOrbitRadius: evaluateInnermostStableCircularOrbitRadius(mass, simulation.spin),
      shadowImpactParameters: evaluateShadowImpactParameters(mass, simulation.spin)
    },
    observer: {
      mode: simulation.paused ? "paused" : "free-fall",
      radius,
      polarAngle,
      azimuthalAngle: observer.cameraCoordinates[CoordinateIndex.AzimuthalAngle],
      radiusInHorizonUnits: radius / horizon.outerRadius,
      properTimeElapsed: input.properTimeElapsed,
      advancedTimeRate: contravariantVelocity[CoordinateIndex.AdvancedTime],
      radialVelocity: contravariantVelocity[CoordinateIndex.Radius],
      azimuthalVelocity: contravariantVelocity[CoordinateIndex.AzimuthalAngle],
      specificEnergy: -covariantMomentum[CoordinateIndex.AdvancedTime],
      specificAngularMomentum: covariantMomentum[CoordinateIndex.AzimuthalAngle],
      carterConstant: worldline ? evaluateCarterConstant(worldline, simulation.spin) : 0,
      insideHorizon: input.insideHorizon,
      insideErgosphere: radius < evaluateErgosphereRadius(mass, simulation.spin, polarAngle),
      journeyEnded: input.journeyEnded,
      verticalFov: input.verticalFov
    },
    analogue: {
      configuration: analogueConfiguration,
      state: evaluateFluidVortexAnalogue(massState, simulation.spin, simulation.initialMass, analogueConfiguration),
      rates: evaluateFluidVortexAnalogueRates(advancedTime, simulation.spin, simulation, analogueConfiguration)
    },
    rendering: {
      ...input.rendering,
      maximumStepCount: simulation.maximumStepCount,
      diagnosticField: simulation.diagnosticField,
      exposureScale: simulation.exposureScale,
      timeScale: simulation.timeScale
    },
    recording: input.recording
  };
}
