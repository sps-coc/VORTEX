import { Vector2, Vector3 } from "three";
import type { PausedCameraControlContext } from "../contributorApi.ts";

// Paused-mode ("free placement") camera: a familiar 3D-viewer orbit camera for
// setting the initial condition. Drag orbits, shift/right-drag pans the target,
// wheel zooms the orbit distance inside the live physical bounds, q/e roll. Every
// handler early-returns while the simulation is running — flight controls own all
// gestures in that mode.

const OrbitRadiansPerPixel = 0.006;
const PanTargetDistanceFractionPerPixel = 0.0007;
const ZoomExponentPerWheelUnit = 0.0012;
const RollRadiansPerKeyPress = 0.08;
const MaximumOrbitPitch = 1.35;

function isTextEntryTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

export function attachPausedCameraControls(context: PausedCameraControlContext): void {
  const lastPointer = new Vector2();
  let dragging = false;
  let dragButton = 0;

  context.domElement.addEventListener("pointerdown", (event) => {
    if (!context.isPaused()) return;
    dragging = true;
    dragButton = event.button;
    lastPointer.set(event.clientX, event.clientY);
    context.domElement.setPointerCapture(event.pointerId);
  });

  context.domElement.addEventListener("pointermove", (event) => {
    if (!dragging || !context.isPaused()) return;
    const deltaX = event.clientX - lastPointer.x;
    const deltaY = event.clientY - lastPointer.y;
    lastPointer.set(event.clientX, event.clientY);

    if (event.shiftKey || dragButton === 2) {
      // Pan along the screen-aligned right/up directions so content follows the
      // cursor, scaled with distance so the gesture covers the same screen fraction
      // at every zoom level.
      const forward = new Vector3();
      context.camera.getWorldDirection(forward);
      const right = new Vector3().crossVectors(forward, context.camera.up).normalize();
      const up = new Vector3().crossVectors(right, forward).normalize();
      const scale = PanTargetDistanceFractionPerPixel * context.placement.distance;
      context.placement.target.addScaledVector(right, -deltaX * scale).addScaledVector(up, deltaY * scale);
    } else {
      // three.js OrbitControls sign convention: the scene follows the drag.
      context.placement.orbitYaw -= deltaX * OrbitRadiansPerPixel;
      context.placement.orbitPitch = Math.max(
        -MaximumOrbitPitch,
        Math.min(MaximumOrbitPitch, context.placement.orbitPitch + deltaY * OrbitRadiansPerPixel)
      );
    }
  });

  context.domElement.addEventListener("pointerup", (event) => {
    dragging = false;
    context.domElement.releasePointerCapture(event.pointerId);
  });

  context.domElement.addEventListener("contextmenu", (event) => event.preventDefault());

  context.domElement.addEventListener(
    "wheel",
    (event) => {
      if (!context.isPaused()) return;
      event.preventDefault();
      const bounds = context.distanceBounds();
      context.placement.distance = Math.max(
        bounds.minimum,
        Math.min(bounds.maximum, context.placement.distance * Math.exp(event.deltaY * ZoomExponentPerWheelUnit))
      );
    },
    { passive: false }
  );

  window.addEventListener("keydown", (event) => {
    if (!context.isPaused() || isTextEntryTarget(event.target)) return;
    if (event.key === "q" || event.key === "Q") context.placement.roll -= RollRadiansPerKeyPress;
    if (event.key === "e" || event.key === "E") context.placement.roll += RollRadiansPerKeyPress;
  });
}
