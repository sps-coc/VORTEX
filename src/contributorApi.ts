import type { PerspectiveCamera, Vector3 } from "three";

// Everything a UI contributor needs to know lives in this file. The two files that
// consume these types — src/controls/pausedCameraControls.ts and
// src/ui/controlPanel.ts — are yours to implement; nothing outside them (and this
// file) needs to be read or changed. The physics and rendering supply live values
// through these interfaces and react to your mutations automatically.

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

export interface DiagnosticFieldOption {
  value: number;
  label: string;
}

// Live values recomputed every frame, delivered to ControlPanel.updateReadout.
export interface SimulationReadout {
  advancedTime: number;
  mass: number;
  massDerivative: number;
  spin: number;
  horizonEquatorialRadius: number;
  horizonArea: number;
  ergosphereEquatorialRadius: number;
  photonOrbitRadii: { prograde: number; retrograde: number };
  innermostStableOrbitRadius: number;
  observerRadius: number;
  observerMode: "paused" | "free-fall";
  insideHorizon: boolean;
  timeDilation: number;
  journeyEnded: boolean;
  frameMilliseconds: number;
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
