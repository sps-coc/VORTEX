import type { PerspectiveCamera, Vector3 } from "three";
import type {
  AnalogueMatchingInvariant,
  FluidVortexAnalogueRates,
  FluidVortexAnalogueState
} from "./physics/fluidVortexAnalogue.ts";

// Everything a UI contributor needs to know lives in this file. The three files that
// consume these types — src/controls/pausedCameraControls.ts, src/ui/controlPanel.ts
// and src/ui/dataPanel.ts — are yours to implement; nothing outside them (and this
// file) needs to be read or changed. The physics and rendering supply live values
// through these interfaces and react to your mutations automatically.
//
// The one exception: the fluid-analogue block of the readout is a large structure
// defined and documented in src/physics/fluidVortexAnalogue.ts. Read that file's
// types (not its maths) when you lay out the analogue readouts.

// The paused ("free placement") camera is described by orbit angles around the black
// hole at the origin. Mutating these fields moves the camera on the next frame:
// - orbitYaw / orbitPitch: angles (radians) of the camera position on its orbit
//   sphere; pitch is clamped sensibly by your own handlers (|pitch| < ~1.35 rad).
// - roll: camera roll around the view axis (radians).
// - distance: orbit radius; keep it within distanceBounds() (see below).
// - target: the look-at point (a three.js Vector3); pan by translating it.
export interface PausedCameraPlacement {
  orbitYaw: number;
  orbitPitch: number;
  roll: number;
  distance: number;
  target: Vector3;
}

export interface PausedCameraControlContext {
  // The rendering canvas: attach your pointer/wheel/key listeners here.
  domElement: HTMLElement;
  // The live three.js camera. Read-only: useful for screen-aligned pan directions
  // (camera.getWorldDirection, camera.up).
  camera: PerspectiveCamera;
  // Mutate this to move the paused camera (see PausedCameraPlacement).
  placement: PausedCameraPlacement;
  // Gate every handler on this: your gestures must do nothing while the simulation
  // is running (flight controls own that mode).
  isPaused: () => boolean;
  // Live physical limits for placement.distance: minimum keeps the camera outside
  // the (growing) apparent horizon, maximum inside the celestial sphere. Re-read
  // them on every zoom event — they change as the black hole accretes.
  distanceBounds: () => { minimum: number; maximum: number };
}

// Simulation parameters the control panel adjusts. All fields are live: assigning a
// new value takes effect on the next frame. Ranges are documented at the panel stub.
export interface AdjustableParameters {
  spin: number;
  accretionRate: number;
  exposureScale: number;
  timeScale: number;
  maximumStepCount: number;
  diagnosticField: number;
}

// The water tank the analogue experiment would be built in. These change nothing
// about the black hole — only the fluid targets derived from it (readout.analogue),
// which is what a contributor tunes when matching the simulation to a real rig.
export interface LaboratoryApparatusParameters {
  laboratoryHorizonRadiusMetres: number;
  laboratoryLayerDepthMetres: number;
  laboratoryTankRadiusMetres: number;
  analogueMatchedInvariant: AnalogueMatchingInvariant;
}

export interface DiagnosticFieldOption {
  value: number;
  label: string;
}

export interface AnalogueMatchingOption {
  value: AnalogueMatchingInvariant;
  label: string;
}

// --- Live readout ----------------------------------------------------------------
// One SimulationReadout is built per frame, handed to your panels, and — while a
// recording is running — written verbatim as one JSONL line. It is deliberately
// exhaustive: anything worth plotting later has to be in here, because nothing else
// is retained.

export interface BlackHoleReadout {
  mass: number;
  massDerivative: number;
  spin: number;
  spinToMassRatio: number;
  angularMomentum: number;
  outerHorizonRadius: number;
  innerHorizonRadius: number;
  // The theta-dependent apparent horizon: for accretion it sits slightly inside the
  // Kerr radius r_+, by at most apparentHorizonMaximumCorrection.
  apparentHorizonEquatorialRadius: number;
  apparentHorizonMaximumCorrection: number;
  horizonRadiusGrowthRate: number;
  horizonArea: number;
  irreducibleMass: number;
  bekensteinHawkingEntropy: number;
  surfaceGravity: number;
  hawkingTemperature: number;
  horizonAngularVelocity: number;
  ergosphereEquatorialRadius: number;
  photonOrbitRadii: { prograde: number; retrograde: number };
  innermostStableOrbitRadius: number;
  shadowImpactParameters: { prograde: number; retrograde: number };
}

export interface ObserverReadout {
  mode: "paused" | "free-fall";
  radius: number;
  polarAngle: number;
  azimuthalAngle: number;
  radiusInHorizonUnits: number;
  properTimeElapsed: number;
  // u^v: the rate of advanced time per unit proper time — the time-dilation factor.
  advancedTimeRate: number;
  radialVelocity: number;
  azimuthalVelocity: number;
  // -p_v and p_psi: conserved in Kerr, and NOT in Kerr-Vaidya — the drift in
  // specificEnergy is the Vaidya term made visible. carterConstant drifts too.
  specificEnergy: number;
  specificAngularMomentum: number;
  carterConstant: number;
  insideHorizon: boolean;
  insideErgosphere: boolean;
  journeyEnded: boolean;
  verticalFov: number;
}

export interface AnalogueReadout {
  configuration: {
    referenceSonicHorizonRadiusMetres: number;
    layerDepthMetres: number;
    tankRadiusMetres: number;
    matchedInvariant: AnalogueMatchingInvariant;
  };
  state: FluidVortexAnalogueState;
  rates: FluidVortexAnalogueRates;
}

export interface RenderingReadout {
  frameMilliseconds: number;
  renderScale: number;
  framebufferWidth: number;
  framebufferHeight: number;
  maximumStepCount: number;
  diagnosticField: number;
  exposureScale: number;
  timeScale: number;
  accumulatedStaticFrames: number;
}

export interface RecordingReadout {
  runIdentifier: string;
  isRecording: boolean;
  recordedLineCount: number;
  recordedByteCount: number;
  sampleIntervalSeconds: number;
  reachedCapacityLimit: boolean;
}

export interface SimulationReadout {
  advancedTime: number;
  paused: boolean;
  blackHole: BlackHoleReadout;
  observer: ObserverReadout;
  analogue: AnalogueReadout;
  rendering: RenderingReadout;
  recording: RecordingReadout;
}

// --- Data collection --------------------------------------------------------------
// Recording appends the readout above to an in-memory JSONL buffer, which the
// contributor downloads and commits alongside their laboratory measurements. See
// data/README.md for the file formats on both sides.
export interface RecordingControls {
  isRecording: () => boolean;
  setRecording: (recording: boolean) => void;
  // How often a frame is written while recording. Below ~0.02 s the buffer fills
  // fast; the default is 0.1 s (10 Hz).
  sampleIntervalSeconds: () => number;
  setSampleIntervalSeconds: (seconds: number) => void;
  // Stamps a labelled marker into the log — use it for anything the operator does by
  // hand ("opened the drain valve", "wave maker on"). Horizon crossings, ergosphere
  // entry, pausing and the end of the journey are marked automatically.
  markEvent: (label: string, detail?: Record<string, number | string | boolean>) => void;
  // Triggers a browser download of the whole recording as .jsonl.
  downloadRecording: () => void;
  // Downloads a starter data/experiment-log.jsonl for this run: the apparatus and
  // run lines with every setpoint the analogue mapping already knows filled in, so
  // the contributor edits blanks instead of copying numbers off the screen.
  downloadExperimentLogTemplate: () => void;
  clear: () => void;
}

export interface ControlPanelContext {
  // Append your UI anywhere under this root (it is document.body); position it
  // freely with your own CSS (the app canvas fills the window behind it).
  mountRoot: HTMLElement;
  // Bind your controls to these fields (see AdjustableParameters).
  parameters: AdjustableParameters;
  // Options for the diagnostic-view selector, in display order.
  diagnosticFieldOptions: DiagnosticFieldOption[];
  // Pause state for your pause/resume button. The space bar also toggles it, so
  // reflect isPaused() in your button label on every updateReadout call.
  isPaused: () => boolean;
  setPaused: (paused: boolean) => void;
  // A fully implemented, self-updating top-down map of the system (horizon,
  // ergosphere, photon orbits, ISCO, observer position). Just append it where you
  // want it and style its container; do not redraw it yourself.
  minimapElement: HTMLElement;
}

export interface ControlPanel {
  // Called once per rendered frame with fresh values — update your labels here.
  updateReadout: (readout: SimulationReadout) => void;
}

// The data panel is the experiment side of the app: the tank parameters, the fluid
// targets the simulation is asking a contributor to build, and the recorder that
// turns a session into a JSONL file. It is a separate contributor-owned file from
// the control panel and shares nothing with it but the readout.
export interface DataPanelContext {
  mountRoot: HTMLElement;
  // Bind your tank controls to these fields (see LaboratoryApparatusParameters).
  parameters: LaboratoryApparatusParameters;
  // Options for the analogue-matching selector, in display order.
  analogueMatchingOptions: AnalogueMatchingOption[];
  recording: RecordingControls;
}

export interface DataPanel {
  updateReadout: (readout: SimulationReadout) => void;
}
