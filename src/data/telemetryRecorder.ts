import { WorkingFluidProperties } from "../physics/fluidVortexAnalogue.ts";
import { buildExperimentLogTemplate } from "./experimentLog.ts";
import type { HorizonSample } from "../physics/apparentHorizon.ts";
import type { RecordingControls, RecordingReadout, SimulationReadout } from "../contributorApi.ts";
import type { SimulationState } from "../types.ts";

// Session recorder: turns a run of the visualization into one JSONL file — one JSON
// object per line, newline-terminated, appendable, and readable a line at a time by
// anything that can parse JSON. The laboratory side of the experiment is logged in
// the same format by hand (data/experiment-log.jsonl), so a figure that overlays
// predicted and measured curves is a join on runIdentifier.
//
// Line kinds, all carrying `kind` and `runIdentifier`:
//   run              once, first line: schema version, parameters, constants
//   frame            the full SimulationReadout at one instant
//   horizon-profile  the theta-resolved apparent horizon, at a coarser stride
//   event            an operator marker or an automatically detected transition

export const TelemetryRecordKind = {
  Run: "run",
  Frame: "frame",
  HorizonProfile: "horizon-profile",
  Event: "event"
} as const;

export const TelemetrySchemaVersion = 1;

const DefaultSampleIntervalSeconds = 0.1;
const MinimumSampleIntervalSeconds = 0.005;
const HorizonProfileFrameStride = 25;
const MaximumRecordedBytes = 64 * 1024 * 1024;
const RunIdentifierRandomDigits = 8;

// Transitions worth a marker without the operator having to notice them. Each is
// stamped whenever its answer changes, so the log always contains the frame where
// the observer crossed in or out.
const AutomaticEventTriggers: Array<{ label: string; read: (readout: SimulationReadout) => boolean }> = [
  { label: "inside-horizon", read: (readout) => readout.observer.insideHorizon },
  { label: "inside-ergosphere", read: (readout) => readout.observer.insideErgosphere },
  { label: "journey-ended", read: (readout) => readout.observer.journeyEnded },
  { label: "paused", read: (readout) => readout.paused }
];

function downloadJsonlFile(fileName: string, contents: string): void {
  const anchor = document.createElement("a");
  anchor.href = URL.createObjectURL(new Blob([contents], { type: "application/x-ndjson" }));
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(anchor.href);
}

export interface TelemetryFrameSource {
  readout: SimulationReadout;
  horizonSamples: HorizonSample[];
  elapsedSeconds: number;
}

export interface TelemetryRecorder {
  controls: RecordingControls;
  readoutStatus: () => RecordingReadout;
  // Called every frame; writes at most one frame line per sample interval and no
  // lines at all while stopped, but always tracks the automatic event triggers so a
  // transition that happens the instant recording starts is not lost.
  offerFrame: (source: TelemetryFrameSource) => void;
  toJsonl: () => string;
  // Returns everything buffered and empties the buffer. Headless capture uses this
  // to stream a long run out in chunks; each chunk re-emits its own run header.
  drain: () => string;
}

export function createTelemetryRecorder(simulation: SimulationState): TelemetryRecorder {
  const runIdentifier = `run-${Math.floor(Math.random() * 10 ** RunIdentifierRandomDigits)
    .toString()
    .padStart(RunIdentifierRandomDigits, "0")}`;

  const lines: string[] = [];
  const state = {
    isRecording: false,
    sampleIntervalSeconds: DefaultSampleIntervalSeconds,
    byteCount: 0,
    frameCount: 0,
    elapsedSeconds: 0,
    advancedTime: 0,
    lastSampleSeconds: Number.NEGATIVE_INFINITY,
    reachedCapacityLimit: false,
    latestReadout: null as SimulationReadout | null,
    triggerValues: new Map<string, boolean>()
  };

  const pushLine = (record: Record<string, unknown>): void => {
    const line = JSON.stringify({ ...record, runIdentifier });
    lines.push(line);
    state.byteCount += line.length + 1;
  };

  const appendRunHeader = (readout: SimulationReadout): void =>
    pushLine({
      kind: TelemetryRecordKind.Run,
      schemaVersion: TelemetrySchemaVersion,
      startedAt: new Date().toISOString(),
      pageLocation: window.location.href,
      userAgent: navigator.userAgent,
      simulation: { ...simulation },
      analogueConfiguration: readout.analogue.configuration,
      unitScaling: readout.analogue.state.unitScaling,
      workingFluidProperties: WorkingFluidProperties,
      // Simulation quantities are geometrized (G = c = hbar = k_B = 1, lengths in
      // units of the initial mass); every analogue quantity is SI.
      geometrizedSimulationUnits: true
    });

  // Every line but the header goes through here, so a file can never begin without
  // the metadata needed to interpret it — including after a drain().
  const append = (record: Record<string, unknown>): void => {
    if (state.reachedCapacityLimit) return;
    if (lines.length === 0 && state.latestReadout) appendRunHeader(state.latestReadout);
    pushLine(record);
    if (state.byteCount < MaximumRecordedBytes) return;
    state.reachedCapacityLimit = true;
    state.isRecording = false;
    pushLine({
      kind: TelemetryRecordKind.Event,
      elapsedSeconds: state.elapsedSeconds,
      advancedTime: state.advancedTime,
      label: "recording-stopped-at-capacity",
      detail: { byteCount: state.byteCount, lineCount: lines.length }
    });
  };

  const appendEvent = (label: string, detail: Record<string, number | string | boolean>): void =>
    append({
      kind: TelemetryRecordKind.Event,
      elapsedSeconds: state.elapsedSeconds,
      advancedTime: state.advancedTime,
      label,
      detail
    });

  const controls: RecordingControls = {
    isRecording: () => state.isRecording,
    setRecording: (recording) => {
      if (recording === state.isRecording || state.reachedCapacityLimit) return;
      state.isRecording = recording;
      state.lastSampleSeconds = Number.NEGATIVE_INFINITY;
      appendEvent(recording ? "recording-started" : "recording-stopped", Object.fromEntries(state.triggerValues));
    },
    sampleIntervalSeconds: () => state.sampleIntervalSeconds,
    setSampleIntervalSeconds: (seconds) => {
      state.sampleIntervalSeconds = Math.max(seconds, MinimumSampleIntervalSeconds);
    },
    markEvent: (label, detail) => appendEvent(label, detail ?? {}),
    downloadRecording: () => downloadJsonlFile(`${runIdentifier}.jsonl`, lines.join("\n") + "\n"),
    downloadExperimentLogTemplate: () => {
      if (!state.latestReadout) return;
      downloadJsonlFile(`${runIdentifier}-experiment-log.jsonl`, buildExperimentLogTemplate(state.latestReadout));
    },
    clear: () => {
      lines.length = 0;
      state.byteCount = 0;
      state.frameCount = 0;
      state.reachedCapacityLimit = false;
      state.lastSampleSeconds = Number.NEGATIVE_INFINITY;
    }
  };

  return {
    controls,
    readoutStatus: () => ({
      runIdentifier,
      isRecording: state.isRecording,
      recordedLineCount: lines.length,
      recordedByteCount: state.byteCount,
      sampleIntervalSeconds: state.sampleIntervalSeconds,
      reachedCapacityLimit: state.reachedCapacityLimit
    }),
    offerFrame: (source) => {
      state.latestReadout = source.readout;
      state.elapsedSeconds = source.elapsedSeconds;
      state.advancedTime = source.readout.advancedTime;
      AutomaticEventTriggers.forEach(({ label, read }) => {
        const value = read(source.readout);
        const hadPreviousValue = state.triggerValues.has(label);
        if (state.triggerValues.get(label) === value) return;
        state.triggerValues.set(label, value);
        if (hadPreviousValue && state.isRecording) appendEvent(label, { entered: value });
      });

      if (!state.isRecording) return;
      if (source.elapsedSeconds - state.lastSampleSeconds < state.sampleIntervalSeconds) return;
      state.lastSampleSeconds = source.elapsedSeconds;
      append({
        kind: TelemetryRecordKind.Frame,
        sequence: state.frameCount,
        elapsedSeconds: source.elapsedSeconds,
        ...source.readout
      });
      if (state.frameCount % HorizonProfileFrameStride === 0) {
        append({
          kind: TelemetryRecordKind.HorizonProfile,
          sequence: state.frameCount,
          elapsedSeconds: source.elapsedSeconds,
          advancedTime: source.readout.advancedTime,
          samples: source.horizonSamples
        });
      }
      state.frameCount += 1;
    },
    toJsonl: () => lines.join("\n") + "\n",
    drain: () => {
      const drained = lines.join("\n") + "\n";
      lines.length = 0;
      state.byteCount = 0;
      return drained;
    }
  };
}
