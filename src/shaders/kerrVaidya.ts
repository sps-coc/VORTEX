import { proceduralNoiseChunk } from "./proceduralNoise.ts";
import { celestialSphereChunk } from "./celestialSphere.ts";
import { spacetimeGeometryChunk, HorizonShapeSampleCount } from "./spacetimeGeometry.ts";
import { geodesicIntegratorChunk } from "./geodesicIntegrator.ts";
import { matterInflowChunk } from "./matterInflow.ts";

export const DiagnosticField = {
  Radiance: 0,
  FrequencyShift: 1,
  NullConstraintError: 2,
  StepCount: 3,
  HorizonProximity: 4,
  OpticalDepth: 5,
  EmissionDensity: 6
} as const;

export const MaximumStepHardCap = 600;

export const copyVertexShader = /* glsl */ `
out vec2 screenUv;

void main() {
  screenUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const shaderPreamble = /* glsl */ `
precision highp float;
precision highp int;

in vec2 screenUv;
out vec4 outputColor;

#define HORIZON_SHAPE_SAMPLES ${HorizonShapeSampleCount}
#define MAXIMUM_STEP_HARD_CAP ${MaximumStepHardCap}

const int FIELD_RADIANCE = ${DiagnosticField.Radiance};
const int FIELD_FREQUENCY_SHIFT = ${DiagnosticField.FrequencyShift};
const int FIELD_NULL_ERROR = ${DiagnosticField.NullConstraintError};
const int FIELD_STEP_COUNT = ${DiagnosticField.StepCount};
const int FIELD_HORIZON_PROXIMITY = ${DiagnosticField.HorizonProximity};
const int FIELD_OPTICAL_DEPTH = ${DiagnosticField.OpticalDepth};
const int FIELD_EMISSION_DENSITY = ${DiagnosticField.EmissionDensity};

uniform vec2 resolution;
uniform float verticalFov;
uniform float spin;
uniform float initialMass;
uniform float accretionRate;
uniform float smoothingTime;
uniform float celestialRadius;
uniform float exposureScale;
uniform float horizonShapePerMassRate[HORIZON_SHAPE_SAMPLES];
uniform vec4 cameraCoordinates;
uniform vec4 observerCovariantTime;
uniform vec4 observerCovariantRadial;
uniform vec4 observerCovariantPolar;
uniform vec4 observerCovariantAzimuthal;
uniform vec3 forwardTetradFrame;
uniform vec3 rightTetradFrame;
uniform vec3 upTetradFrame;
uniform int diagnosticField;
uniform int maximumStepCount;
uniform float frameSeed;
uniform int cameraInsideHorizon;
uniform float interiorCaptureRadius;

const float PI = 3.141592653589793;
const float TWO_PI = 6.283185307179586;
`;

const rayMarchChunk = /* glsl */ `
const float HORIZON_CAPTURE_MARGIN = 1.005;
const float FRAME_JITTER_SPREAD = 0.25;
// Rays that exhaust the step budget far from the photon shell (slow polar crossings)
// are treated as escaped; near the shell they would keep winding, so they stay dark.
const float EXHAUSTED_SKY_FALLBACK_HORIZON_MULTIPLE = 3.0;

const float TRANSMITTANCE_FLOOR = 0.015;

struct MarchResult {
  GeodesicRay ray;
  bool escaped;
  vec3 radiance;
  float transmittance;
  float opticalDepth;
  float emissionDensity;
  float emissionWeightedShift;
  float emissionWeight;
  float maximumNullError;
  float minimumHorizonProximity;
  float stepFraction;
};

// The received photon has momentum k = -q; the observed frequency at the camera is
// q . u_camera = 1 by construction, so the shift factor at any emitter along the
// path is g = nu_observed / nu_emitted = 1 / (q_mu u_emitter^mu).
// Rays within about half a pixel of the meridian plane are snapped to exactly
// p_psi = 0 (the tetrad axes carry no other angular momentum, so zeroing the
// azimuthal direction component does this exactly while staying null). Their polar
// dynamics are then regular through the spin axis, which removes the stiff
// 1/sin(theta) axis artifact at no visible cost.
const float MERIDIONAL_SNAP_DIRECTION = 5.0e-4;

vec4 initialCovariantMomentum(vec2 fragmentCoordinate) {
  vec2 uv = fragmentCoordinate / resolution;
  vec2 ndc = uv * 2.0 - 1.0;
  ndc.x *= resolution.x / max(resolution.y, 1.0);
  float focalLength = 1.0 / tan(0.5 * verticalFov);
  vec3 lookTetrad = normalize(forwardTetradFrame * focalLength + rightTetradFrame * ndc.x + upTetradFrame * ndc.y);
  if (abs(lookTetrad.z) < MERIDIONAL_SNAP_DIRECTION) {
    lookTetrad.z = 0.0;
    lookTetrad = normalize(lookTetrad);
  }
  return -observerCovariantTime
    + lookTetrad.x * observerCovariantRadial
    + lookTetrad.y * observerCovariantPolar
    + lookTetrad.z * observerCovariantAzimuthal;
}

// Backward rays run into the past, where the mass is never larger than at the
// camera, so the camera-time Kerr radius bounds every horizon along the path.
// Beyond a few of those radii capture is impossible and the per-step mass and
// horizon evaluations are skipped entirely.
const float NEAR_FIELD_HORIZON_MULTIPLE = 4.0;

MarchResult marchGeodesic(GeodesicRay ray) {
  MarchResult result = MarchResult(ray, false, vec3(0.0), 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0e6, 1.0);
  float horizonRadiusUpperBound = outerKerrRadius(evaluateMass(cameraCoordinates.x).mass);
  float nearFieldRadius = NEAR_FIELD_HORIZON_MULTIPLE * horizonRadiusUpperBound;
  float matterOuterRadius = MATTER_OUTER_HORIZON_MULTIPLE * horizonRadiusUpperBound;
  bool trackNullError = diagnosticField == FIELD_NULL_ERROR;
  bool trackHorizonProximity = diagnosticField == FIELD_HORIZON_PROXIMITY;

  for (int stepIndex = 0; stepIndex < MAXIMUM_STEP_HARD_CAP; stepIndex += 1) {
    if (stepIndex >= maximumStepCount) break;

    float radius = result.ray.coordinates.y;
    if (radius > celestialRadius) {
      result.escaped = true;
      result.stepFraction = float(stepIndex) / float(maximumStepCount);
      return result;
    }
    if (result.transmittance < TRANSMITTANCE_FLOOR) {
      result.stepFraction = float(stepIndex) / float(maximumStepCount);
      return result;
    }

    // With the camera inside the horizon the backward rays legitimately live at
    // r < r_+ (they fell in, in forward time); they only end near the inner horizon,
    // where the classical prediction stops. Advanced coordinates stay regular at r_+.
    float horizonRadius = horizonRadiusUpperBound;
    if (radius < nearFieldRadius) {
      MassState localMass = evaluateMass(result.ray.coordinates.x);
      horizonRadius = apparentHorizonRadius(result.ray.coordinates.z, localMass);
      if (trackHorizonProximity) {
        result.minimumHorizonProximity = min(result.minimumHorizonProximity, (radius - horizonRadius) / horizonRadius);
      }
      if (cameraInsideHorizon == 0 && radius < horizonRadius * HORIZON_CAPTURE_MARGIN) {
        result.stepFraction = float(stepIndex) / float(maximumStepCount);
        return result;
      }
      if (cameraInsideHorizon == 1 && radius < interiorCaptureRadius) {
        result.stepFraction = float(stepIndex) / float(maximumStepCount);
        return result;
      }
    }

    // Measured pre-step so the final capture plunge (inside the horizon, where the
    // conformal terms blow up) never pollutes the constraint statistics.
    if (trackNullError) {
      result.maximumNullError = max(result.maximumNullError, nullConstraintError(result.ray));
    }

    vec4 positionRate, momentumRate;
    evaluateGeodesicDerivatives(result.ray, positionRate, momentumRate);
    float arcLength;
    float stepSize = chooseStepSize(result.ray, positionRate, horizonRadius, arcLength);

    if (radius < matterOuterRadius) {
      EmissionSample emission = sampleInflowEmission(result.ray, horizonRadius, arcLength);
      result.radiance += result.transmittance * emission.radiance;
      result.opticalDepth += emission.opticalDepth;
      result.transmittance *= exp(-emission.opticalDepth);
      result.emissionDensity += emission.density;
      float weight = result.transmittance * emission.density;
      result.emissionWeightedShift += emission.frequencyShift * weight;
      result.emissionWeight += weight;
    }

    result.ray = advanceGeodesic(result.ray, stepSize, positionRate, momentumRate);
  }

  MassState finalMass = evaluateMass(result.ray.coordinates.x);
  result.escaped =
    result.ray.coordinates.y >
    EXHAUSTED_SKY_FALLBACK_HORIZON_MULTIPLE * apparentHorizonRadius(result.ray.coordinates.z, finalMass);
  return result;
}

vec3 escapeDirection(GeodesicRay ray) {
  vec4 positionRate, momentumRate;
  evaluateGeodesicDerivatives(ray, positionRate, momentumRate);
  float polar = ray.coordinates.z;
  float azimuth = ray.coordinates.w;
  vec3 radialUnit = vec3(sin(polar) * cos(azimuth), cos(polar), sin(polar) * sin(azimuth));
  vec3 polarUnit = vec3(cos(polar) * cos(azimuth), -sin(polar), cos(polar) * sin(azimuth));
  vec3 azimuthalUnit = vec3(-sin(azimuth), 0.0, cos(azimuth));
  float radius = ray.coordinates.y;
  return normalize(
    radialUnit * positionRate.y +
    polarUnit * (radius * positionRate.z) +
    azimuthalUnit * (radius * sin(polar) * positionRate.w)
  );
}

// Static sky observer at the celestial radius: u^mu = (1/sqrt(-g_vv), 0, 0, 0).
float celestialFrequencyShift(GeodesicRay ray) {
  MassState massState = evaluateMass(ray.coordinates.x);
  float radius = ray.coordinates.y;
  float cosine = cos(ray.coordinates.z);
  float rhoSquared = radius * radius + spin * spin * cosine * cosine;
  float lapse = sqrt(max(1.0 - 2.0 * massState.mass * radius / rhoSquared, 1.0e-4));
  float emittedFrequency = ray.momentum.x / lapse;
  return 1.0 / max(emittedFrequency, 1.0e-4);
}
`;

const mainChunk = /* glsl */ `
void main() {
  vec2 jitter = vec2(
    hash31(vec3(gl_FragCoord.xy, frameSeed)),
    hash31(vec3(gl_FragCoord.yx, frameSeed + 19.1))
  ) - 0.5;
  vec2 fragmentCoordinate = gl_FragCoord.xy + jitter * FRAME_JITTER_SPREAD;

  GeodesicRay ray = GeodesicRay(cameraCoordinates, initialCovariantMomentum(fragmentCoordinate));
  MarchResult march = marchGeodesic(ray);

  vec3 radiance = march.radiance;
  float skyShift = 0.0;
  if (march.escaped) {
    skyShift = celestialFrequencyShift(march.ray);
    radiance += march.transmittance * celestialSphereRadiance(escapeDirection(march.ray)) * pow(skyShift, 4.0);
  }
  float frequencyShift = march.emissionWeight > 0.0
    ? march.emissionWeightedShift / march.emissionWeight
    : skyShift;

  if (diagnosticField == FIELD_RADIANCE) {
    outputColor = vec4(radiance * exposureScale, 1.0);
  } else if (diagnosticField == FIELD_FREQUENCY_SHIFT) {
    outputColor = vec4(vec3(frequencyShift), 1.0);
  } else if (diagnosticField == FIELD_NULL_ERROR) {
    outputColor = vec4(vec3(march.maximumNullError), 1.0);
  } else if (diagnosticField == FIELD_STEP_COUNT) {
    outputColor = vec4(vec3(march.stepFraction), 1.0);
  } else if (diagnosticField == FIELD_HORIZON_PROXIMITY) {
    outputColor = vec4(vec3(march.minimumHorizonProximity), 1.0);
  } else if (diagnosticField == FIELD_OPTICAL_DEPTH) {
    outputColor = vec4(vec3(march.opticalDepth), 1.0);
  } else if (diagnosticField == FIELD_EMISSION_DENSITY) {
    outputColor = vec4(vec3(march.emissionDensity), 1.0);
  } else {
    outputColor = vec4(vec3(0.0), 1.0);
  }
}
`;

export const kerrVaidyaFragmentShader = [
  shaderPreamble,
  proceduralNoiseChunk,
  celestialSphereChunk,
  spacetimeGeometryChunk,
  geodesicIntegratorChunk,
  matterInflowChunk,
  rayMarchChunk,
  mainChunk
].join("\n");
