export interface SimulationState {
  spin: number;
  initialMass: number;
  accretionRate: number;
  smoothingTime: number;
  celestialRadius: number;
  exposureScale: number;
  timeScale: number;
  diagnosticField: number;
  maximumStepCount: number;
  paused: boolean;
}
