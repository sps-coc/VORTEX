import { Vector2, WebGLRenderer } from "three";
import type { SimulationState } from "../types";

// Running-mode ("physical observer") inputs only: drag rotates the observer's head,
// wheel fires forward/backward thrust, shift/right-drag fires lateral thrust; all
// other motion is free fall. Thrust accumulates as rapidity impulses consumed (and
// acceleration-clamped) by the frame loop. Paused-mode gestures live in
// pausedCameraControls.ts.
export interface FlightInputState {
  lookYaw: number;
  lookPitch: number;
  pendingThrust: { forward: number; right: number; up: number };
  dragging: boolean;
  dragButton: number;
  lastPointer: Vector2;
}

const LookRadiansPerPixel = 0.0038;
const ForwardThrustRapidityPerWheelUnit = 6e-4;
const LateralThrustRapidityPerPixel = 4e-4;
const MaximumLookPitch = 1.45;

export function attachFlightControls(
  renderer: WebGLRenderer,
  input: FlightInputState,
  simulation: SimulationState
): void {
  renderer.domElement.addEventListener("pointerdown", (event) => {
    input.dragging = true;
    input.dragButton = event.button;
    input.lastPointer.set(event.clientX, event.clientY);
    renderer.domElement.setPointerCapture(event.pointerId);
  });

  renderer.domElement.addEventListener("pointermove", (event) => {
    if (!input.dragging || simulation.paused) return;
    const current = new Vector2(event.clientX, event.clientY);
    const delta = current.clone().sub(input.lastPointer);
    input.lastPointer.copy(current);

    if (event.shiftKey || input.dragButton === 2) {
      input.pendingThrust.right += delta.x * LateralThrustRapidityPerPixel;
      input.pendingThrust.up -= delta.y * LateralThrustRapidityPerPixel;
    } else {
      input.lookYaw += delta.x * LookRadiansPerPixel;
      input.lookPitch = Math.max(-MaximumLookPitch, Math.min(MaximumLookPitch, input.lookPitch + delta.y * LookRadiansPerPixel));
    }
  });

  renderer.domElement.addEventListener("pointerup", (event) => {
    input.dragging = false;
    renderer.domElement.releasePointerCapture(event.pointerId);
  });

  renderer.domElement.addEventListener("contextmenu", (event) => event.preventDefault());

  renderer.domElement.addEventListener(
    "wheel",
    (event) => {
      if (simulation.paused) return;
      event.preventDefault();
      input.pendingThrust.forward -= event.deltaY * ForwardThrustRapidityPerWheelUnit;
    },
    { passive: false }
  );

  window.addEventListener("keydown", (event) => {
    if (event.code === "Space") simulation.paused = !simulation.paused;
  });
}
