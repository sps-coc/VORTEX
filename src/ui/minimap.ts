export interface MinimapState {
  horizonEquatorialRadius: number;
  ergosphereEquatorialRadius: number;
  photonOrbitRadii: { prograde: number; retrograde: number };
  innermostStableOrbitRadius: number;
  celestialRadius: number;
  cameraRadius: number;
  cameraAzimuthalAngle: number;
  cameraPolarAngle: number;
  verticalFov: number;
}

const MapPixelSize = 216;
const MapEdgeMargin = 6;

const MapColors = {
  background: "rgba(5, 8, 14, 0.82)",
  celestial: "rgba(110, 140, 200, 0.5)",
  innermostStableOrbit: "rgba(120, 200, 160, 0.75)",
  photonBand: "rgba(255, 190, 90, 0.28)",
  ergosphere: "rgba(255, 140, 60, 0.85)",
  horizon: "#000000",
  horizonRim: "rgba(240, 244, 255, 0.9)",
  camera: "#7fc4ff",
  viewWedge: "rgba(127, 196, 255, 0.25)"
} as const;

// Square-root radial compression keeps the horizon-scale structure readable next to
// the celestial sphere, which is ~40x larger.
function compressRadius(radius: number, celestialRadius: number): number {
  return (MapPixelSize / 2 - MapEdgeMargin) * Math.sqrt(Math.min(radius / celestialRadius, 1));
}

// Fully implemented map component: the returned element is handed to the control
// panel author to mount and position; update() is driven by the frame loop.
export function createMinimap(): { element: HTMLElement; update: (state: MinimapState) => void } {
  const root = document.createElement("div");
  root.className = "hud-minimap";
  const canvas = document.createElement("canvas");
  canvas.width = MapPixelSize;
  canvas.height = MapPixelSize;
  root.append(canvas);
  const context = canvas.getContext("2d");

  function drawCircle(radius: number, style: string, celestialRadius: number, fill: boolean, dash: number[] = []): void {
    if (!context) return;
    context.beginPath();
    context.setLineDash(dash);
    context.arc(MapPixelSize / 2, MapPixelSize / 2, compressRadius(radius, celestialRadius), 0, 2 * Math.PI);
    if (fill) {
      context.fillStyle = style;
      context.fill();
    } else {
      context.strokeStyle = style;
      context.stroke();
    }
    context.setLineDash([]);
  }

  function update(state: MinimapState): void {
    if (!context) return;
    context.fillStyle = MapColors.background;
    context.fillRect(0, 0, MapPixelSize, MapPixelSize);

    drawCircle(state.celestialRadius, MapColors.celestial, state.celestialRadius, false, [3, 3]);

    const photonOuter = compressRadius(state.photonOrbitRadii.retrograde, state.celestialRadius);
    const photonInner = compressRadius(state.photonOrbitRadii.prograde, state.celestialRadius);
    context.beginPath();
    context.arc(MapPixelSize / 2, MapPixelSize / 2, photonOuter, 0, 2 * Math.PI);
    context.arc(MapPixelSize / 2, MapPixelSize / 2, photonInner, 0, 2 * Math.PI, true);
    context.fillStyle = MapColors.photonBand;
    context.fill();

    drawCircle(state.innermostStableOrbitRadius, MapColors.innermostStableOrbit, state.celestialRadius, false, [2, 3]);
    drawCircle(state.ergosphereEquatorialRadius, MapColors.ergosphere, state.celestialRadius, false);
    drawCircle(state.horizonEquatorialRadius, MapColors.horizon, state.celestialRadius, true);
    drawCircle(state.horizonEquatorialRadius, MapColors.horizonRim, state.celestialRadius, false);

    // Top-down equatorial projection: +x right, +z down; the wedge points from the
    // observer toward the hole with the camera's horizontal field of view.
    const cameraMapRadius = compressRadius(state.cameraRadius * Math.sin(state.cameraPolarAngle), state.celestialRadius);
    const cameraX = MapPixelSize / 2 + cameraMapRadius * Math.cos(state.cameraAzimuthalAngle);
    const cameraY = MapPixelSize / 2 + cameraMapRadius * Math.sin(state.cameraAzimuthalAngle);
    const towardCenter = Math.atan2(MapPixelSize / 2 - cameraY, MapPixelSize / 2 - cameraX);
    context.beginPath();
    context.moveTo(cameraX, cameraY);
    context.arc(cameraX, cameraY, cameraMapRadius, towardCenter - state.verticalFov / 2, towardCenter + state.verticalFov / 2);
    context.closePath();
    context.fillStyle = MapColors.viewWedge;
    context.fill();
    context.beginPath();
    context.arc(cameraX, cameraY, 3.2, 0, 2 * Math.PI);
    context.fillStyle = MapColors.camera;
    context.fill();
  }

  return { element: root, update };
}
