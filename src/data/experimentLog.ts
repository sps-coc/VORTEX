import type { SimulationReadout } from "../contributorApi.ts";

// The laboratory half of the data set. Telemetry from the visualization says what the
// vortex should be doing; this file says what it actually did. Both are JSONL keyed
// on the same run identifier, so overlaying a prediction on a measurement is a join
// rather than a transcription.
//
// data/experiment-log.jsonl is the file a contributor fills in by hand. `npm run
// log:check` validates it against everything below.

export const ExperimentRecordKind = {
  Apparatus: "apparatus",
  Run: "run",
  Measurement: "measurement",
  Note: "note"
} as const;
export type ExperimentRecordKind = (typeof ExperimentRecordKind)[keyof typeof ExperimentRecordKind];

export const RequiredExperimentFields: Record<ExperimentRecordKind, string[]> = {
  [ExperimentRecordKind.Apparatus]: [
    "apparatusId",
    "tankRadiusMetres",
    "undisturbedDepthMetres",
    "drainApertureRadiusMetres",
    "workingFluid",
    "fluidTemperatureCelsius"
  ],
  [ExperimentRecordKind.Run]: ["runId", "apparatusId", "simulationRunIdentifier", "startedAt"],
  [ExperimentRecordKind.Measurement]: ["runId", "elapsedSeconds", "quantity", "value", "unit"],
  [ExperimentRecordKind.Note]: ["runId", "text"]
};

// A measured quantity, the unit it must be logged in, and the dot path of its
// counterpart in a recorded telemetry frame. A null path means the quantity has no
// prediction in the simulation — it is something only the tank can tell you.
export interface MeasurableQuantity {
  unit: string;
  telemetryPath: string | null;
  // Radius-resolved quantities also require `radiusMetres` on the record.
  requiresRadius?: boolean;
}

export const MeasurableQuantities: Record<string, MeasurableQuantity> = {
  sonicHorizonRadius: { unit: "m", telemetryPath: "analogue.state.geometry.sonicHorizonRadiusMetres" },
  ergosurfaceRadius: { unit: "m", telemetryPath: "analogue.state.geometry.ergosurfaceRadiusMetres" },
  horizonAngularVelocity: {
    unit: "rad/s",
    telemetryPath: "analogue.state.geometry.horizonAngularVelocityRadiansPerSecond"
  },
  volumetricDrainRate: { unit: "L/min", telemetryPath: "analogue.state.flow.volumetricDrainRateLitresPerMinute" },
  circulation: { unit: "m^2/s", telemetryPath: "analogue.state.flow.circulationMetresSquaredPerSecond" },
  radialSpeedAtHorizon: {
    unit: "m/s",
    telemetryPath: "analogue.state.flow.radialSpeedAtHorizonMetresPerSecond"
  },
  tangentialSpeedAtHorizon: {
    unit: "m/s",
    telemetryPath: "analogue.state.flow.tangentialSpeedAtHorizonMetresPerSecond"
  },
  waveSpeed: { unit: "m/s", telemetryPath: "analogue.state.unitScaling.waveSpeedMetresPerSecond" },
  surfaceGravity: { unit: "1/s", telemetryPath: "analogue.state.thermodynamics.surfaceGravityPerSecond" },
  hawkingFrequency: { unit: "Hz", telemetryPath: "analogue.state.thermodynamics.hawkingFrequencyHertz" },
  freeSurfaceDepressionAtHorizon: {
    unit: "m",
    telemetryPath: "analogue.state.validity.freeSurfaceDepressionAtHorizonMetres"
  },
  // The measured depth profile. Only its value at the sonic horizon has a predicted
  // counterpart (freeSurfaceDepressionAtHorizon), so the profile itself stands alone.
  layerDepth: { unit: "m", telemetryPath: null, requiresRadius: true },
  radialVelocity: { unit: "m/s", telemetryPath: null, requiresRadius: true },
  azimuthalVelocity: { unit: "m/s", telemetryPath: null, requiresRadius: true },
  // The headline superradiance observable: reflected over incident amplitude for a
  // probe below the m-th threshold frequency. Greater than one is amplification.
  waveAmplificationFactor: { unit: "1", telemetryPath: null },
  incidentWaveAmplitude: { unit: "m", telemetryPath: null },
  reflectedWaveAmplitude: { unit: "m", telemetryPath: null },
  quasinormalRingdownFrequency: { unit: "Hz", telemetryPath: null },
  quasinormalDecayRate: { unit: "1/s", telemetryPath: null }
};

// A starter log for the run currently on screen, with every setpoint the analogue
// mapping has already worked out filled in. The contributor edits the blanks rather
// than copying numbers off a panel by hand.
export function buildExperimentLogTemplate(readout: SimulationReadout): string {
  const { configuration, state, rates } = readout.analogue;
  const apparatusId = `rig-${readout.recording.runIdentifier.replace("run-", "")}`;
  return [
    {
      kind: ExperimentRecordKind.Apparatus,
      apparatusId,
      tankRadiusMetres: configuration.tankRadiusMetres,
      tankShape: "cylindrical",
      undisturbedDepthMetres: configuration.layerDepthMetres,
      drainApertureRadiusMetres: null,
      workingFluid: "water",
      fluidTemperatureCelsius: 20,
      inflowMethod: "",
      pumpModel: "",
      flowMeterModel: "",
      surfaceMeasurementMethod: "",
      cameraModel: "",
      cameraFramesPerSecond: null,
      notes: ""
    },
    {
      kind: ExperimentRecordKind.Run,
      runId: `${readout.recording.runIdentifier}-lab`,
      apparatusId,
      simulationRunIdentifier: readout.recording.runIdentifier,
      startedAt: new Date().toISOString(),
      operator: "",
      targetSpin: readout.blackHole.spin,
      targetAccretionRate: readout.blackHole.massDerivative,
      matchedInvariant: configuration.matchedInvariant,
      drainSetpointLitresPerMinute: state.flow.volumetricDrainRateLitresPerMinute,
      circulationSetpointMetresSquaredPerSecond: state.flow.circulationMetresSquaredPerSecond,
      drainRampLitresPerMinutePerSecond: rates.volumetricDrainRateRateLitresPerMinutePerSecond,
      circulationRampMetresSquaredPerSecondPerSecond: rates.circulationRate,
      probeFrequencyHertz: state.thermodynamics.superradianceThresholdFrequenciesHertz[0] / 2,
      probeAzimuthalNumber: 1,
      settlingTimeSeconds: null,
      notes: ""
    }
  ]
    .map((record) => JSON.stringify(record))
    .join("\n")
    .concat("\n");
}
