import type { PausedCameraControlContext } from "../contributorApi.ts";

// ---------------------------------------------------------------------------------
// YOUR FILE. Implement the paused-mode ("free placement") camera controls here.
// Everything you need is in `context` — see PausedCameraControlContext in
// src/contributorApi.ts. You do not need to read any other file.
//
// While the simulation is paused the camera is unphysical by design: the user is
// setting an initial condition, so movement should feel like a familiar 3D-viewer
// orbit camera. While running, the flight controls own all gestures — every one of
// your handlers must early-return when !context.isPaused().
//
// Required behavior (attach listeners to context.domElement):
// - Orbit: pointer drag rotates the camera around the black hole. Mutate
//   placement.orbitYaw / placement.orbitPitch (clamp |pitch| <= ~1.35 rad so the
//   camera never flips over the poles). A sensitivity around 0.006 rad/px feels good.
// - Pan: shift-drag or right-button drag translates placement.target. Use three.js:
//   context.camera.getWorldDirection(...) and context.camera.up give you the view
//   basis; pan along the screen-aligned right/up vectors, scaled by
//   placement.distance (about 0.0007 * distance per px).
// - Zoom: wheel scales placement.distance exponentially
//   (distance *= Math.exp(deltaY * 0.0012) works well). Clamp the result inside
//   context.distanceBounds() — re-read the bounds on every event, they follow the
//   growing horizon.
// - Optional: q/e keys nudge placement.roll by ~0.08 rad.
//
// Implementation notes:
// - Use pointer events with setPointerCapture/releasePointerCapture on
//   context.domElement so drags keep tracking outside the canvas.
// - Call event.preventDefault() in the wheel handler ({ passive: false }) and
//   suppress the context menu for right-drag pan.
// - Track the previous pointer position yourself (a three.js Vector2 is handy).
// - Feel free to add any helper functions in this file.
// ---------------------------------------------------------------------------------

export function attachPausedCameraControls(context: PausedCameraControlContext): void {
  void context;
}
