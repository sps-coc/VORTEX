import "./styles.css";
import {
  FloatType,
  HalfFloatType,
  LinearFilter,
  NearestFilter,
  PerspectiveCamera,
  RGBAFormat,
  Scene,
  GLSL3,
  ShaderMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
  WebGLRenderTarget
} from "three";
import { createFullscreenTriangle, fullscreenCamera } from "./rendering/fullscreenTriangle";
import { PostProcessor } from "./rendering/postProcessing";
import { solveApparentHorizon } from "./physics/apparentHorizon.ts";
import { evaluateMassFunction } from "./physics/massFunction.ts";
import { copyVertexShader, kerrVaidyaFragmentShader, DiagnosticField, MaximumStepHardCap } from "./shaders/kerrVaidya.ts";
import { HorizonShapeSampleCount } from "./shaders/spacetimeGeometry.ts";
import {
  applyProperAcceleration,
  advanceWorldline,
  computePausedObserverState,
  computeRunningObserverState,
  createRestingWorldline,
  horizonRadiiAt,
  lookDirectionTetradFrame,
  type ObserverUniformState
} from "./observer/physicalObserver.ts";
import {
  CoordinateIndex,
  evaluateErgosphereRadius,
  evaluateHorizonArea,
  evaluateInnermostStableCircularOrbitRadius,
  evaluateOuterKerrRadius,
  evaluatePhotonOrbitRadii,
  evaluateShadowImpactParameters,
  raiseMomentumIndex,
  type GeodesicState
} from "./physics/kerrVaidyaGeometry.ts";
import { createControlPanel } from "./ui/controlPanel.ts";
import { createMinimap } from "./ui/minimap.ts";
import { attachFlightControls, type FlightInputState } from "./controls/flightControls.ts";
import { attachPausedCameraControls } from "./controls/pausedCameraControls.ts";
import type { PausedCameraPlacement, SimulationReadout } from "./contributorApi.ts";
import type { SimulationState } from "./types";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing #app element");

const renderer = new WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(1);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.autoClear = false;
app.appendChild(renderer.domElement);

const camera = new PerspectiveCamera(54, window.innerWidth / window.innerHeight, 0.01, 500);

const scene = new Scene();

const renderState = {
  scale: 0.42,
  averageFrameMs: 16.7,
  width: Math.max(320, Math.floor(window.innerWidth * 0.42)),
  height: Math.max(240, Math.floor(window.innerHeight * 0.42))
};

const radianceTarget = new WebGLRenderTarget(renderState.width, renderState.height, {
  type: HalfFloatType,
  format: RGBAFormat,
  minFilter: LinearFilter,
  magFilter: LinearFilter,
  depthBuffer: false,
  stencilBuffer: false
});

const simulation: SimulationState = {
  spin: 0.82,
  initialMass: 1.0,
  accretionRate: 0.0018,
  smoothingTime: 24,
  celestialRadius: 72,
  exposureScale: 1.0,
  timeScale: 1.25,
  diagnosticField: DiagnosticField.Radiance,
  maximumStepCount: 380,
  paused: false
};

declare global {
  interface Window {
    kerrVaidyaState?: {
      advancedTime: number;
      mass: number;
      massDerivative: number;
      spin: number;
      horizon: {
        baseRadius: number;
        maximumCorrection: number;
        equatorialRadius: number;
        area: number;
        samples: Array<{ theta: number; radius: number; correction: number }>;
      };
      characteristicRadii: {
        ergosphereEquatorial: number;
        photonOrbits: { prograde: number; retrograde: number };
        innermostStableOrbit: number;
        shadowImpactParameters: { prograde: number; retrograde: number };
      };
      observer: {
        coordinates: [number, number, number, number];
        mode: "paused" | "free-fall";
        insideHorizon: boolean;
        timeDilation: number;
        verticalFov: number;
      };
      rendering: {
        renderScale: number;
        radianceFramebuffer: [number, number];
        nullConstraintTolerance: number;
        averageFrameMs: number;
        diagnosticField: number;
        maximumStepCount: number;
      };
    };
    kerrVaidyaControls?: {
      setSimulation: (partial: Partial<SimulationState>) => void;
      setOrbit: (partial: { yaw?: number; pitch?: number; distance?: number; advancedTime?: number }) => void;
    };
    kerrVaidyaDiagnostics?: {
      captureFieldStatistics: (
        fieldId: number,
        thresholds?: number[]
      ) => {
        width: number;
        height: number;
        minimum: number;
        maximum: number;
        maximumLocation: { x: number; y: number };
        mean: number;
        fractionsBelow: Record<string, number>;
        centerRowBelowFirstThreshold: { first: number; last: number } | null;
      };
    };
  }
}

const uniforms = {
  resolution: { value: new Vector2(renderState.width, renderState.height) },
  verticalFov: { value: (camera.fov * Math.PI) / 180 },
  spin: { value: simulation.spin },
  initialMass: { value: simulation.initialMass },
  accretionRate: { value: simulation.accretionRate },
  smoothingTime: { value: simulation.smoothingTime },
  celestialRadius: { value: simulation.celestialRadius },
  exposureScale: { value: simulation.exposureScale },
  horizonShapePerMassRate: { value: Array.from({ length: HorizonShapeSampleCount }, () => 0) },
  cameraCoordinates: { value: new Vector4() },
  observerCovariantTime: { value: new Vector4() },
  observerCovariantRadial: { value: new Vector4() },
  observerCovariantPolar: { value: new Vector4() },
  observerCovariantAzimuthal: { value: new Vector4() },
  forwardTetradFrame: { value: new Vector3() },
  rightTetradFrame: { value: new Vector3() },
  upTetradFrame: { value: new Vector3() },
  diagnosticField: { value: simulation.diagnosticField },
  maximumStepCount: { value: simulation.maximumStepCount },
  frameSeed: { value: 0 },
  cameraInsideHorizon: { value: 0 },
  interiorCaptureRadius: { value: 0 }
};

const material = new ShaderMaterial({
  glslVersion: GLSL3,
  vertexShader: copyVertexShader,
  fragmentShader: kerrVaidyaFragmentShader,
  uniforms,
  depthWrite: false,
  depthTest: false
});
scene.add(createFullscreenTriangle(material));

const postProcessor = new PostProcessor(renderState.width, renderState.height);

const placement: PausedCameraPlacement = {
  orbitYaw: 0,
  orbitPitch: 0.38,
  roll: 0,
  distance: 19.4,
  target: new Vector3(0, 0, 0)
};

const flightInput: FlightInputState = {
  lookYaw: 0,
  lookPitch: 0,
  pendingThrust: { forward: 0, right: 0, up: 0 },
  dragging: false,
  dragButton: 0,
  lastPointer: new Vector2()
};

const clock = { advancedTime: 0, lastTimestamp: performance.now() };
const journey: { worldline: GeodesicState | null; ended: boolean; timeDilation: number } = {
  worldline: null,
  ended: false,
  timeDilation: 1
};
// The journey ends a buffer above the inner (Cauchy) horizon, where the classical
// prediction stops being trustworthy and the integrator's gradients blow up.
const JourneyEndDepthFraction = 0.12;
const MinimumPausedDistanceHorizonFactor = 1.05;
const MaximumPausedDistanceCelestialFactor = 0.9;

const DiagnosticFieldLabels: Array<[number, string]> = [
  [DiagnosticField.Radiance, "radiance"],
  [DiagnosticField.FrequencyShift, "frequency shift"],
  [DiagnosticField.NullConstraintError, "null error"],
  [DiagnosticField.StepCount, "step count"],
  [DiagnosticField.HorizonProximity, "horizon proximity"],
  [DiagnosticField.OpticalDepth, "optical depth"],
  [DiagnosticField.EmissionDensity, "emission density"]
];

const minimap = createMinimap();
attachFlightControls(renderer, flightInput, simulation);
attachPausedCameraControls({
  domElement: renderer.domElement,
  camera,
  placement,
  isPaused: () => simulation.paused,
  distanceBounds: () => ({
    minimum:
      MinimumPausedDistanceHorizonFactor *
      evaluateOuterKerrRadius(evaluateMassFunction(clock.advancedTime, simulation).mass, simulation.spin),
    maximum: MaximumPausedDistanceCelestialFactor * simulation.celestialRadius
  })
});
const panel = createControlPanel({
  mountRoot: document.body,
  parameters: simulation,
  diagnosticFieldOptions: DiagnosticFieldLabels.map(([value, label]) => ({ value, label })),
  isPaused: () => simulation.paused,
  setPaused: (paused) => {
    simulation.paused = paused;
  },
  minimapElement: minimap.element
});

function updateCartesianCamera(): void {
  const cosPitch = Math.cos(placement.orbitPitch);
  const offset = new Vector3(
    Math.sin(placement.orbitYaw) * cosPitch,
    Math.sin(placement.orbitPitch),
    Math.cos(placement.orbitYaw) * cosPitch
  ).multiplyScalar(placement.distance);
  camera.position.copy(placement.target).add(offset);
  camera.up.set(Math.sin(placement.roll), Math.cos(placement.roll), 0).normalize();
  camera.lookAt(placement.target);
  camera.updateMatrixWorld();
}

function computePausedObserver(mass: number): ObserverUniformState {
  updateCartesianCamera();
  const forward = new Vector3();
  camera.getWorldDirection(forward);
  const right = new Vector3().crossVectors(forward, camera.up).normalize();
  const up = new Vector3().crossVectors(right, forward).normalize();
  return computePausedObserverState(
    camera.position,
    forward,
    right,
    up,
    mass,
    simulation.spin,
    clock.advancedTime,
    simulation.celestialRadius
  );
}

// Pausing mid-flight hands the worldline's position to the free orbit camera so the
// "initial condition" editing starts from where the journey stopped.
function syncOrbitPlacementFromWorldline(worldline: GeodesicState): void {
  const [, radius, polarAngle, azimuthalAngle] = worldline.position;
  placement.distance = Math.max(radius, 1.5);
  placement.orbitPitch = Math.asin(Math.max(-1, Math.min(1, Math.cos(polarAngle))));
  placement.orbitYaw = Math.atan2(Math.cos(azimuthalAngle), Math.sin(azimuthalAngle));
  placement.target.set(0, 0, 0);
  placement.roll = 0;
}

function beginJourneyFromPausedCamera(): void {
  updateCartesianCamera();
  const mass = evaluateMassFunction(clock.advancedTime, simulation).mass;
  journey.worldline = createRestingWorldline(
    camera.position,
    mass,
    simulation.spin,
    clock.advancedTime,
    simulation.celestialRadius
  );
  journey.ended = false;
  const pausedObserver = computePausedObserver(mass);
  const [forwardRadial, forwardPolar, forwardAzimuthal] = pausedObserver.forwardTetradFrame;
  flightInput.lookPitch = Math.asin(Math.max(-1, Math.min(1, -forwardPolar)));
  flightInput.lookYaw = Math.atan2(forwardAzimuthal, -forwardRadial);
}

function advanceJourney(deltaSeconds: number): ObserverUniformState {
  const properTimeDelta = deltaSeconds * simulation.timeScale;
  const worldline = journey.worldline;
  if (!worldline) throw new Error("journey worldline missing");

  const look = lookDirectionTetradFrame(flightInput.lookYaw, flightInput.lookPitch);
  const thrust: [number, number, number] = [0, 1, 2].map(
    (axis) =>
      flightInput.pendingThrust.forward * look.forward[axis] +
      flightInput.pendingThrust.right * look.right[axis] +
      flightInput.pendingThrust.up * look.up[axis]
  ) as [number, number, number];
  flightInput.pendingThrust.forward = 0;
  flightInput.pendingThrust.right = 0;
  flightInput.pendingThrust.up = 0;

  let advanced = applyProperAcceleration(worldline, simulation.spin, simulation, thrust, Math.max(properTimeDelta, 1e-4));
  advanced = advanceWorldline(advanced, simulation.spin, simulation, properTimeDelta);
  journey.worldline = advanced;
  clock.advancedTime = advanced.position[CoordinateIndex.AdvancedTime];
  journey.timeDilation = raiseMomentumIndex(advanced, simulation.spin, simulation)[CoordinateIndex.AdvancedTime];

  const horizons = horizonRadiiAt(clock.advancedTime, simulation.spin, simulation);
  const journeyEndRadius = horizons.inner + JourneyEndDepthFraction * Math.max(horizons.outer - horizons.inner, 0.05);
  if (advanced.position[CoordinateIndex.Radius] < journeyEndRadius) {
    journey.ended = true;
    simulation.paused = true;
  }
  return computeRunningObserverState(advanced, simulation.spin, simulation, flightInput.lookYaw, flightInput.lookPitch);
}

function assignObserverUniforms(observer: ObserverUniformState): void {
  uniforms.cameraCoordinates.value.fromArray(observer.cameraCoordinates);
  uniforms.observerCovariantTime.value.fromArray(observer.observerCovariantTime);
  uniforms.observerCovariantRadial.value.fromArray(observer.observerCovariantRadial);
  uniforms.observerCovariantPolar.value.fromArray(observer.observerCovariantPolar);
  uniforms.observerCovariantAzimuthal.value.fromArray(observer.observerCovariantAzimuthal);
  uniforms.forwardTetradFrame.value.fromArray(observer.forwardTetradFrame);
  uniforms.rightTetradFrame.value.fromArray(observer.rightTetradFrame);
  uniforms.upTetradFrame.value.fromArray(observer.upTetradFrame);
  uniforms.verticalFov.value = (camera.fov * Math.PI) / 180;
}

// The 32-bit float diagnostic target exists only while validation tooling asks for
// it — it is the largest buffer in the app and normal rendering never touches it.
const diagnosticReadback: { target: WebGLRenderTarget | null; pixels: Float32Array | null } = {
  target: null,
  pixels: null
};

function acquireDiagnosticReadback(): { target: WebGLRenderTarget; pixels: Float32Array } {
  const { width, height } = renderState;
  if (!diagnosticReadback.target) {
    diagnosticReadback.target = new WebGLRenderTarget(width, height, {
      type: FloatType,
      format: RGBAFormat,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: false,
      stencilBuffer: false
    });
  } else if (diagnosticReadback.target.width !== width || diagnosticReadback.target.height !== height) {
    diagnosticReadback.target.setSize(width, height);
    diagnosticReadback.pixels = null;
  }
  if (!diagnosticReadback.pixels || diagnosticReadback.pixels.length !== width * height * 4) {
    diagnosticReadback.pixels = new Float32Array(width * height * 4);
  }
  return { target: diagnosticReadback.target, pixels: diagnosticReadback.pixels };
}

function resizeRadiancePipeline(): void {
  renderState.width = Math.max(320, Math.floor(window.innerWidth * renderState.scale));
  renderState.height = Math.max(240, Math.floor(window.innerHeight * renderState.scale));
  radianceTarget.setSize(renderState.width, renderState.height);
  postProcessor.resize(renderState.width, renderState.height);
  uniforms.resolution.value.set(renderState.width, renderState.height);
}

function adaptRenderResolution(deltaSeconds: number): void {
  const frameMs = deltaSeconds * 1000;
  renderState.averageFrameMs = renderState.averageFrameMs * 0.96 + frameMs * 0.04;
  const previousScale = renderState.scale;
  if (renderState.averageFrameMs > 42) {
    renderState.scale = Math.max(0.3, renderState.scale - 0.025);
  } else if (renderState.averageFrameMs < 24) {
    renderState.scale = Math.min(0.62, renderState.scale + 0.01);
  }
  if (Math.abs(renderState.scale - previousScale) > 0.001) {
    resizeRadiancePipeline();
  }
}

const NullConstraintTolerance = 1e-3;

// Temporal accumulation regimes: while the scene evolves the history is a light
// smoothing filter; while paused and untouched it becomes a running mean that
// converges the jittered samples toward a supersampled still.
const RunningTemporalMix = 0.8;
const InteractingTemporalMix = 0.25;
const MaximumProgressiveTemporalMix = 0.995;
const FrameSeedPeriod = 8192;

const accumulationState = { signature: "", staticFrameCount: 0, frameCount: 0 };

function chooseTemporalMix(): number {
  const signature = [
    placement.orbitYaw,
    placement.orbitPitch,
    placement.roll,
    placement.distance,
    placement.target.x,
    placement.target.y,
    placement.target.z,
    flightInput.lookYaw,
    flightInput.lookPitch,
    simulation.spin,
    simulation.initialMass,
    simulation.accretionRate,
    simulation.smoothingTime,
    simulation.celestialRadius,
    simulation.exposureScale,
    simulation.diagnosticField,
    simulation.maximumStepCount
  ].join(",");
  const signatureChanged = signature !== accumulationState.signature;
  accumulationState.signature = signature;
  accumulationState.staticFrameCount = signatureChanged ? 0 : accumulationState.staticFrameCount + 1;

  if (signatureChanged) postProcessor.resetAccumulation();
  if (!simulation.paused) return signatureChanged ? InteractingTemporalMix : RunningTemporalMix;
  return Math.min(
    accumulationState.staticFrameCount / (accumulationState.staticFrameCount + 1),
    MaximumProgressiveTemporalMix
  );
}

function publishSimulationState(
  mass: number,
  massDerivative: number,
  baseHorizonRadius: number,
  maximumHorizonCorrection: number,
  horizonSamples: Array<{ theta: number; radius: number; correction: number }>,
  observer: ObserverUniformState,
  insideHorizon: boolean
): void {
  const equatorialHorizonRadius = horizonSamples[Math.floor(horizonSamples.length / 2)].radius;
  window.kerrVaidyaState = {
    advancedTime: clock.advancedTime,
    mass,
    massDerivative,
    spin: simulation.spin,
    horizon: {
      baseRadius: baseHorizonRadius,
      maximumCorrection: maximumHorizonCorrection,
      equatorialRadius: equatorialHorizonRadius,
      area: evaluateHorizonArea(mass, simulation.spin),
      samples: horizonSamples
    },
    characteristicRadii: {
      ergosphereEquatorial: evaluateErgosphereRadius(mass, simulation.spin, Math.PI / 2),
      photonOrbits: evaluatePhotonOrbitRadii(mass, simulation.spin),
      innermostStableOrbit: evaluateInnermostStableCircularOrbitRadius(mass, simulation.spin),
      shadowImpactParameters: evaluateShadowImpactParameters(mass, simulation.spin)
    },
    observer: {
      coordinates: observer.cameraCoordinates,
      mode: simulation.paused ? "paused" : "free-fall",
      insideHorizon,
      timeDilation: journey.timeDilation,
      verticalFov: uniforms.verticalFov.value
    },
    rendering: {
      renderScale: renderState.scale,
      radianceFramebuffer: [renderState.width, renderState.height],
      nullConstraintTolerance: NullConstraintTolerance,
      averageFrameMs: renderState.averageFrameMs,
      diagnosticField: simulation.diagnosticField,
      maximumStepCount: simulation.maximumStepCount
    }
  };
}

window.kerrVaidyaControls = {
  setSimulation: (partial) => Object.assign(simulation, partial),
  // Explicit placement is a new initial condition: any in-flight worldline is
  // discarded so the next running frame starts fresh from this orbit position.
  setOrbit: (partial) => {
    if (partial.yaw !== undefined) placement.orbitYaw = partial.yaw;
    if (partial.pitch !== undefined) placement.orbitPitch = partial.pitch;
    if (partial.distance !== undefined) placement.distance = partial.distance;
    if (partial.advancedTime !== undefined) clock.advancedTime = partial.advancedTime;
    journey.worldline = null;
    journey.ended = false;
  }
};

window.kerrVaidyaDiagnostics = {
  captureFieldStatistics: (fieldId, thresholds = []) => {
    const previousField = uniforms.diagnosticField.value;
    uniforms.diagnosticField.value = fieldId;
    const { target, pixels } = acquireDiagnosticReadback();
    renderer.setRenderTarget(target);
    renderer.render(scene, fullscreenCamera);
    const { width, height } = renderState;
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    renderer.setRenderTarget(null);
    uniforms.diagnosticField.value = previousField;

    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    let maximumLocation = { x: 0, y: 0 };
    let sum = 0;
    const belowCounts = thresholds.map(() => 0);
    for (let pixelIndex = 0; pixelIndex < width * height; pixelIndex += 1) {
      const value = pixels[pixelIndex * 4];
      minimum = Math.min(minimum, value);
      if (value > maximum) {
        maximum = value;
        maximumLocation = { x: pixelIndex % width, y: Math.floor(pixelIndex / width) };
      }
      sum += value;
      thresholds.forEach((threshold, thresholdIndex) => {
        if (value < threshold) belowCounts[thresholdIndex] += 1;
      });
    }

    let centerRowBelowFirstThreshold: { first: number; last: number } | null = null;
    if (thresholds.length > 0) {
      const centerRowOffset = Math.floor(height / 2) * width * 4;
      const belowColumns = Array.from({ length: width }, (_, column) => column).filter(
        (column) => pixels[centerRowOffset + column * 4] < thresholds[0]
      );
      if (belowColumns.length > 0) {
        centerRowBelowFirstThreshold = { first: belowColumns[0], last: belowColumns.at(-1) ?? belowColumns[0] };
      }
    }

    return {
      width,
      height,
      minimum,
      maximum,
      maximumLocation,
      mean: sum / (width * height),
      fractionsBelow: Object.fromEntries(
        thresholds.map((threshold, thresholdIndex) => [String(threshold), belowCounts[thresholdIndex] / (width * height)])
      ),
      centerRowBelowFirstThreshold
    };
  }
};

window.addEventListener("resize", () => {
  renderer.setPixelRatio(1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  resizeRadiancePipeline();
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
});

function frame(timestamp: number): void {
  const deltaSeconds = Math.min((timestamp - clock.lastTimestamp) / 1000, 0.05);
  clock.lastTimestamp = timestamp;
  adaptRenderResolution(deltaSeconds);

  let observer: ObserverUniformState;
  if (simulation.paused) {
    if (journey.worldline) {
      syncOrbitPlacementFromWorldline(journey.worldline);
      journey.worldline = null;
    }
    journey.timeDilation = 1;
    observer = computePausedObserver(evaluateMassFunction(clock.advancedTime, simulation).mass);
  } else {
    if (!journey.worldline) beginJourneyFromPausedCamera();
    observer = advanceJourney(deltaSeconds);
  }

  const massState = evaluateMassFunction(clock.advancedTime, simulation);
  const horizon = solveApparentHorizon(massState.mass, simulation.spin, massState.massDerivative);
  const horizonShape = uniforms.horizonShapePerMassRate.value;
  const shapeScale = Math.abs(massState.massDerivative) > 1e-12 ? 1 / massState.massDerivative : 0;
  horizon.samples.forEach((sample, index) => {
    horizonShape[index] = sample.correction * shapeScale;
  });

  const cameraRadius = observer.cameraCoordinates[CoordinateIndex.Radius];
  const insideHorizon = !simulation.paused && cameraRadius < evaluateOuterKerrRadius(massState.mass, simulation.spin);
  const innerHorizonRadius =
    massState.mass - Math.sqrt(Math.max(massState.mass * massState.mass - simulation.spin * simulation.spin, 0));

  assignObserverUniforms(observer);
  uniforms.spin.value = simulation.spin;
  uniforms.initialMass.value = simulation.initialMass;
  uniforms.accretionRate.value = simulation.accretionRate;
  uniforms.smoothingTime.value = simulation.smoothingTime;
  uniforms.celestialRadius.value = simulation.celestialRadius;
  uniforms.exposureScale.value = simulation.exposureScale;
  uniforms.diagnosticField.value = simulation.diagnosticField;
  uniforms.maximumStepCount.value = Math.min(simulation.maximumStepCount, MaximumStepHardCap);
  uniforms.cameraInsideHorizon.value = insideHorizon ? 1 : 0;
  uniforms.interiorCaptureRadius.value = 1.02 * Math.max(innerHorizonRadius, 0.05);
  accumulationState.frameCount = (accumulationState.frameCount + 1) % FrameSeedPeriod;
  uniforms.frameSeed.value = accumulationState.frameCount;

  const readout: SimulationReadout = {
    advancedTime: clock.advancedTime,
    mass: massState.mass,
    massDerivative: massState.massDerivative,
    spin: simulation.spin,
    horizonEquatorialRadius: horizon.samples[Math.floor(horizon.samples.length / 2)].radius,
    horizonArea: evaluateHorizonArea(massState.mass, simulation.spin),
    ergosphereEquatorialRadius: evaluateErgosphereRadius(massState.mass, simulation.spin, Math.PI / 2),
    photonOrbitRadii: evaluatePhotonOrbitRadii(massState.mass, simulation.spin),
    innermostStableOrbitRadius: evaluateInnermostStableCircularOrbitRadius(massState.mass, simulation.spin),
    observerRadius: cameraRadius,
    observerMode: simulation.paused ? "paused" : "free-fall",
    insideHorizon,
    timeDilation: journey.timeDilation,
    journeyEnded: journey.ended,
    frameMilliseconds: renderState.averageFrameMs
  };
  panel.updateReadout(readout);
  minimap.update({
    horizonEquatorialRadius: readout.horizonEquatorialRadius,
    ergosphereEquatorialRadius: readout.ergosphereEquatorialRadius,
    photonOrbitRadii: readout.photonOrbitRadii,
    innermostStableOrbitRadius: readout.innermostStableOrbitRadius,
    celestialRadius: simulation.celestialRadius,
    cameraRadius,
    cameraAzimuthalAngle: observer.cameraCoordinates[CoordinateIndex.AzimuthalAngle],
    cameraPolarAngle: observer.cameraCoordinates[CoordinateIndex.PolarAngle],
    verticalFov: uniforms.verticalFov.value
  });
  publishSimulationState(
    massState.mass,
    massState.massDerivative,
    horizon.baseRadius,
    horizon.maximumCorrection,
    horizon.samples,
    observer,
    insideHorizon
  );

  const temporalMix = chooseTemporalMix();
  renderer.setRenderTarget(radianceTarget);
  renderer.render(scene, fullscreenCamera);
  renderer.setRenderTarget(null);
  postProcessor.render(renderer, radianceTarget.texture, temporalMix);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
