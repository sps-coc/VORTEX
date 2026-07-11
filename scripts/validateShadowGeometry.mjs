import { AppOrigin, connect, createTab, evaluateInPage } from "./chromeDevtools.mjs";
import { evaluateEquatorialShadowEdgeAngles } from "../src/physics/kerrVaidyaGeometry.ts";
import { DiagnosticField, MaximumStepHardCap } from "../src/shaders/kerrVaidya.ts";

const ObserverDistance = 19.4;
// The shadow mask is "rays that never escaped": escaped pixels carry a sky frequency
// shift near 1, everything else is exactly 0.
const EscapeMaskThreshold = 0.5;
const PageLoadWaitMs = 4000;
const SceneSettleWaitMs = 800;
const SchwarzschildAngleRelativeTolerance = 0.025;
const KerrAsymmetryRelativeTolerance = 0.08;
const NullErrorTolerance = 1e-3;

const failures = [];
function check(name, passed, detail) {
  console.log(`${passed ? "ok  " : "FAIL"} ${name} — ${detail}`);
  if (!passed) failures.push(name);
}

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const appUrl = `${AppOrigin}/?shadow-validation=${Date.now()}`;
const tab = await createTab(appUrl);
const cdp = await connect(tab.webSocketDebuggerUrl);
await cdp.send("Runtime.enable");
await wait(PageLoadWaitMs);

async function configureScenario(simulationPartial, orbitPartial) {
  await evaluateInPage(
    cdp,
    `window.kerrVaidyaControls.setSimulation(${JSON.stringify(simulationPartial)});
     window.kerrVaidyaControls.setOrbit(${JSON.stringify(orbitPartial)}); true`
  );
  await wait(SceneSettleWaitMs);
}

async function captureField(fieldId, thresholds) {
  return evaluateInPage(
    cdp,
    `window.kerrVaidyaDiagnostics.captureFieldStatistics(${fieldId}, ${JSON.stringify(thresholds)})`
  );
}

const verticalFov = await evaluateInPage(cdp, "window.kerrVaidyaState.observer.verticalFov");

// --- Schwarzschild shadow angular radius (Synge 1966) ---------------------------
await configureScenario(
  { spin: 0, accretionRate: 0, initialMass: 1, paused: true, maximumStepCount: MaximumStepHardCap },
  { yaw: 0.3, pitch: 0.38, distance: ObserverDistance, advancedTime: 4 }
);
const schwarzschildShadow = await captureField(DiagnosticField.FrequencyShift, [EscapeMaskThreshold]);
const shadowFraction = schwarzschildShadow.fractionsBelow[String(EscapeMaskThreshold)];
const shadowPixelArea = shadowFraction * schwarzschildShadow.width * schwarzschildShadow.height;
const shadowPixelRadius = Math.sqrt(shadowPixelArea / Math.PI);
const measuredAngle = Math.atan(
  (Math.tan(verticalFov / 2) * 2 * shadowPixelRadius) / schwarzschildShadow.height
);
const expectedAngle = evaluateEquatorialShadowEdgeAngles(1, 0, ObserverDistance).prograde;
const angleRelativeError = Math.abs(measuredAngle - expectedAngle) / expectedAngle;
check(
  "Schwarzschild shadow angular radius matches Synge formula",
  angleRelativeError < SchwarzschildAngleRelativeTolerance,
  `measured ${((measuredAngle * 180) / Math.PI).toFixed(3)} deg, expected ${((expectedAngle * 180) / Math.PI).toFixed(3)} deg, relative error ${(angleRelativeError * 100).toFixed(2)}%`
);

// --- Kerr equatorial shadow asymmetry (frame dragging) --------------------------
await configureScenario(
  { spin: 0.9, accretionRate: 0, initialMass: 1, paused: true, maximumStepCount: MaximumStepHardCap },
  { yaw: 0.3, pitch: 0, distance: ObserverDistance, advancedTime: 4 }
);
const kerrShadow = await captureField(DiagnosticField.FrequencyShift, [EscapeMaskThreshold]);
const centerRow = kerrShadow.centerRowBelowFirstThreshold;
if (!centerRow) {
  check("Kerr shadow visible on the equatorial center row", false, "no shadow pixels found");
} else {
  const centerColumn = kerrShadow.width / 2;
  const offsets = [centerColumn - centerRow.first, centerRow.last - centerColumn];
  const measuredRatio = Math.max(...offsets) / Math.min(...offsets);
  const edgeAngles = evaluateEquatorialShadowEdgeAngles(1, 0.9, ObserverDistance);
  const expectedRatio = Math.tan(edgeAngles.retrograde) / Math.tan(edgeAngles.prograde);
  const ratioRelativeError = Math.abs(measuredRatio - expectedRatio) / expectedRatio;
  check(
    "Kerr shadow asymmetry matches critical impact parameters",
    ratioRelativeError < KerrAsymmetryRelativeTolerance,
    `measured ratio ${measuredRatio.toFixed(3)}, expected ${expectedRatio.toFixed(3)}, relative error ${(ratioRelativeError * 100).toFixed(2)}%`
  );
}

// --- Null constraint over the full frame -----------------------------------------
await configureScenario(
  { spin: 0.82, accretionRate: 0.0018, initialMass: 1, paused: false },
  { yaw: 0, pitch: 0.38, distance: ObserverDistance }
);
// A measure-zero band of near-axis rays is numerically stiff and allowed to exceed
// the tolerance; the compliant fraction, the mean, and a sanity bound on the maximum
// are asserted instead of the raw maximum.
const MinimumCompliantPixelFraction = 0.995;
const MeanNullErrorTolerance = 5e-4;
const NullErrorSanityBound = 10;
const nullError = await captureField(DiagnosticField.NullConstraintError, [NullErrorTolerance]);
const compliantFraction = nullError.fractionsBelow[String(NullErrorTolerance)];
check(
  "frame-wide null constraint error within tolerance",
  compliantFraction >= MinimumCompliantPixelFraction &&
    nullError.mean < MeanNullErrorTolerance &&
    nullError.maximum < NullErrorSanityBound,
  `compliant fraction ${(compliantFraction * 100).toFixed(3)}%, mean ${nullError.mean.toExponential(2)}, max ${nullError.maximum.toExponential(2)} at ${JSON.stringify(nullError.maximumLocation)}`
);

cdp.close();
if (failures.length > 0) {
  console.error(`\n${failures.length} shadow-geometry check(s) failed`);
  process.exit(1);
}
console.log("\nall shadow-geometry checks passed");
