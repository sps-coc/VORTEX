export const matterInflowChunk = /* glsl */ `
// Cinematic inflow: the density, emissivity, and temperature patterns are artistic
// (the nature of the mass source is out of scope), but the kinematics are exact —
// the emitter four-velocity is a normalized combination of the local ZAMO frame,
// radial infall, and prograde swirl, and every shift/beaming factor comes from
// g = 1 / (p_mu u_emitter^mu) along the traced null geodesic.

const float MATTER_OUTER_HORIZON_MULTIPLE = 22.0;
const float MATTER_EQUATORIAL_BAND_COSINE = 0.55;
const float MATTER_DENSITY_PER_MASS_RATE = 300.0;
const float EMISSION_BRIGHTNESS = 2.5;
const float MATTER_ABSORPTION_PER_DENSITY = 0.035;
const float SCALE_HEIGHT_INNER_FRACTION = 0.14;
const float SCALE_HEIGHT_FLARE = 0.05;
const float INFALL_SPEED_FACTOR = 0.55;
const float SWIRL_SPEED_FACTOR = 1.0;
const float MAXIMUM_FLOW_SPEED = 0.92;
const float EMISSION_TEMPERATURE_EXPONENT = 0.65;
const float FREQUENCY_SHIFT_INTENSITY_EXPONENT = 4.0;
const float FREQUENCY_SHIFT_FLOOR = 0.02;
const float FREQUENCY_SHIFT_CEILING = 12.0;

// Spin-up story (the water-vortex analogy): matter begins as separated clumps at
// rest in the local ZAMO frame — "still water", already dragged by the hole — and
// differential orbital shear winds the clump field into spiral streams while the
// inner edge migrates toward the horizon. Inner radii spin up first, like the core
// of a vortex.
const float SWIRL_TIME_SCALE = 5.0;
const float SWIRL_TIME_RADIUS_EXPONENT = 1.5;
const float RING_START_HORIZON_MULTIPLE = 9.0;
const float RING_OUTER_HORIZON_MULTIPLE = 16.0;
const float RING_REACH_TIME = 14.0;
const float CLUMP_THRESHOLD = 0.46;
const float CLUMP_SHARPNESS = 0.82;

float swirlSpinUpFactor(float advancedTime, float normalizedRadius) {
  float localSpinUpTime = SWIRL_TIME_SCALE * pow(normalizedRadius, SWIRL_TIME_RADIUS_EXPONENT);
  return 1.0 - exp(-max(advancedTime, 0.0) / localSpinUpTime);
}

// Accumulated rotation angle integral of Omega_orbital * spinUp dv, analytic.
float accumulatedRotationAngle(float advancedTime, float radius, float normalizedRadius, float mass) {
  float localSpinUpTime = SWIRL_TIME_SCALE * pow(normalizedRadius, SWIRL_TIME_RADIUS_EXPONENT);
  float time = max(advancedTime, 0.0);
  float shearedTime = time + localSpinUpTime * (exp(-time / localSpinUpTime) - 1.0);
  return sqrt(mass / max(radius * radius * radius, 1.0e-3)) * shearedTime;
}

struct EmissionSample {
  vec3 radiance;
  float opticalDepth;
  float density;
  float frequencyShift;
};

// Approximate blackbody hue on a normalized temperature scale (1 = inner-edge heat).
vec3 blackbodyColor(float normalizedTemperature) {
  float heat = clamp(normalizedTemperature, 0.0, 2.5);
  vec3 ember = vec3(0.92, 0.26, 0.08);
  vec3 amber = vec3(1.0, 0.72, 0.35);
  vec3 white = vec3(1.0, 0.98, 0.94);
  vec3 blue = vec3(0.62, 0.74, 1.0);
  vec3 color = mix(ember, amber, smoothstep(0.15, 0.6, heat));
  color = mix(color, white, smoothstep(0.6, 1.2, heat));
  return mix(color, blue, smoothstep(1.2, 2.2, heat));
}

// Exact emitter four-velocity: gamma (u_zamo + beta_r e_rhat + beta_psi e_psihat),
// built from the metric at the sample point so u.u = -1 identically. At
// spinUp = 0 the matter is a ZAMO at rest — "still water", already dragged by the
// hole's rotation, which is the fluid-experiment analogy.
vec4 emitterFourVelocity(float radius, float polarAngle, MassState massState, float spinUp, float coherence) {
  float sine = sin(polarAngle);
  float cosine = cos(polarAngle);
  float sineSquared = max(sine * sine, POLAR_SINE_FLOOR * POLAR_SINE_FLOOR);
  float rhoSquared = radius * radius + spin * spin * cosine * cosine;
  float radiusSpinSquared = radius * radius + spin * spin;
  float delta = radiusSpinSquared - 2.0 * massState.mass * radius;
  float sigmaSquared = radiusSpinSquared * radiusSpinSquared - spin * spin * delta * sineSquared;

  float metricTimeTime = -(1.0 - 2.0 * massState.mass * radius / rhoSquared);
  float metricTimeAzimuthal = -2.0 * spin * massState.mass * radius * sineSquared / rhoSquared;
  float metricAzimuthalAzimuthal = sigmaSquared * sineSquared / rhoSquared;
  float metricRadialAzimuthal = -spin * sineSquared;

  float zamoTimeRate = inversesqrt(max(
    metricTimeAzimuthal * metricTimeAzimuthal / metricAzimuthalAzimuthal - metricTimeTime,
    1.0e-8
  ));
  vec4 zamo = vec4(zamoTimeRate, 0.0, 0.0, -metricTimeAzimuthal / metricAzimuthalAzimuthal * zamoTimeRate);

  float inverseAzimuthalNorm = inversesqrt(metricAzimuthalAzimuthal);
  vec4 azimuthalAxis = vec4(0.0, 0.0, 0.0, inverseAzimuthalNorm);

  // Gram-Schmidt radial axis: dr has covariant azimuthal part -a sin^2(theta), and
  // g(dr, u) = u^v + g_rpsi u^psi because g_rv = 1.
  float radialAlongTime = zamo.x + metricRadialAzimuthal * zamo.w;
  float radialAlongAzimuthal = metricRadialAzimuthal * inverseAzimuthalNorm;
  vec4 radialUnnormalized = vec4(0.0, 1.0, 0.0, 0.0) + radialAlongTime * zamo - radialAlongAzimuthal * azimuthalAxis;
  float radialNormSquared =
    metricTimeTime * radialUnnormalized.x * radialUnnormalized.x +
    2.0 * radialUnnormalized.x * radialUnnormalized.y +
    2.0 * metricTimeAzimuthal * radialUnnormalized.x * radialUnnormalized.w +
    2.0 * metricRadialAzimuthal * radialUnnormalized.y * radialUnnormalized.w +
    metricAzimuthalAzimuthal * radialUnnormalized.w * radialUnnormalized.w;
  vec4 radialAxis = radialUnnormalized * inversesqrt(max(radialNormSquared, 1.0e-8));

  float freeFallSpeed = sqrt(min(2.0 * massState.mass / max(radius, 1.0e-3), 0.95));
  float orbitalSpeed = sqrt(min(massState.mass / max(radius, 1.0e-3), 0.6));
  float radialFlow = -INFALL_SPEED_FACTOR * freeFallSpeed * spinUp * (1.0 - 0.55 * coherence);
  float azimuthalFlow = SWIRL_SPEED_FACTOR * orbitalSpeed * spinUp * coherence;
  float flowSpeedSquared = radialFlow * radialFlow + azimuthalFlow * azimuthalFlow;
  if (flowSpeedSquared > MAXIMUM_FLOW_SPEED * MAXIMUM_FLOW_SPEED) {
    float rescale = MAXIMUM_FLOW_SPEED * inversesqrt(flowSpeedSquared);
    radialFlow *= rescale;
    azimuthalFlow *= rescale;
    flowSpeedSquared = MAXIMUM_FLOW_SPEED * MAXIMUM_FLOW_SPEED;
  }
  float lorentzGamma = inversesqrt(1.0 - flowSpeedSquared);
  return lorentzGamma * (zamo + radialFlow * radialAxis + azimuthalFlow * azimuthalAxis);
}

// Clump field sampled in material coordinates: the same blobs persist over time, and
// the radius-dependent accumulated rotation shears them from separated "planet
// crumbs" at rest into trailing spiral streams — structure formation by differential
// dragging rather than a painted spiral pattern.
struct InflowSample {
  float density;
  float spinUp;
  float coherence;
  float innerEdge;
};

InflowSample inflowDensity(float radius, float polarAngle, float azimuthalAngle, float advancedTime, MassState massState, float horizonRadius) {
  float cosine = cos(polarAngle);
  float normalizedRadius = radius / horizonRadius;
  InflowSample inflow;
  inflow.density = 0.0;
  inflow.spinUp = swirlSpinUpFactor(advancedTime, normalizedRadius);
  inflow.coherence = clamp(1.6 / normalizedRadius + 0.25, 0.0, 0.95);
  // Inner edge migrates from the initial ring toward the horizon as matter spins up
  // and drains inward; brightness and heat track the edge, not the horizon.
  inflow.innerEdge = 1.0 + (RING_START_HORIZON_MULTIPLE - 1.0) * exp(-max(advancedTime, 0.0) / RING_REACH_TIME);
  if (abs(cosine) > MATTER_EQUATORIAL_BAND_COSINE) return inflow;

  float envelope = smoothstep(inflow.innerEdge - 0.8, inflow.innerEdge + 0.8, normalizedRadius) *
    (1.0 - smoothstep(0.8 * RING_OUTER_HORIZON_MULTIPLE, RING_OUTER_HORIZON_MULTIPLE, normalizedRadius));
  if (envelope < 1.0e-4) return inflow;

  float height = radius * cosine;
  float scaleHeight = SCALE_HEIGHT_INNER_FRACTION * horizonRadius + SCALE_HEIGHT_FLARE * max(radius - horizonRadius, 0.0);
  float equatorial = exp(-height * height / max(scaleHeight * scaleHeight, 1.0e-5));

  float materialAngle = azimuthalAngle - accumulatedRotationAngle(advancedTime, radius, normalizedRadius, massState.mass);
  vec3 materialCoordinates = vec3(
    log(normalizedRadius) * 5.0,
    cos(materialAngle) * 2.6,
    sin(materialAngle) * 2.6
  );
  float clumpNoise = fractalNoise(materialCoordinates);
  float clumps = smoothstep(CLUMP_THRESHOLD, CLUMP_THRESHOLD + (1.0 - CLUMP_SHARPNESS) * 0.5, clumpNoise);
  float shearedHaze = 0.14 * inflow.spinUp * smoothstep(0.30, 0.55, clumpNoise);

  float radialFalloff = pow(max(normalizedRadius / inflow.innerEdge, 1.0), -1.9);
  inflow.density = massState.derivative * MATTER_DENSITY_PER_MASS_RATE *
    equatorial * envelope * (1.3 * clumps + shearedHaze) * radialFalloff;
  return inflow;
}

const float CLUMP_BASE_GLOW = 0.12;
const vec3 CLUMP_BASE_GLOW_COLOR = vec3(0.80, 0.74, 0.66);

EmissionSample sampleInflowEmission(GeodesicRay ray, float horizonRadius, float properStepLength) {
  EmissionSample emission = EmissionSample(vec3(0.0), 0.0, 0.0, 0.0);
  MassState massState = evaluateMass(ray.coordinates.x);
  InflowSample inflow = inflowDensity(
    ray.coordinates.y, ray.coordinates.z, ray.coordinates.w, ray.coordinates.x,
    massState, horizonRadius
  );
  if (inflow.density <= 0.0) return emission;

  vec4 emitter = emitterFourVelocity(ray.coordinates.y, ray.coordinates.z, massState, inflow.spinUp, inflow.coherence);
  float emittedFrequency = dot(ray.momentum, emitter);
  float frequencyShift = clamp(
    1.0 / max(emittedFrequency, 1.0e-3),
    FREQUENCY_SHIFT_FLOOR,
    FREQUENCY_SHIFT_CEILING
  );

  // Matter heats as it spins up and spirals toward the migrating inner edge; the
  // still clumps start cool but keep a faint ambient glow so they read against space.
  float edgeProximity = inflow.innerEdge * horizonRadius / max(ray.coordinates.y, 1.0e-3);
  float normalizedTemperature = pow(clamp(edgeProximity, 0.0, 1.0), EMISSION_TEMPERATURE_EXPONENT) *
    (0.30 + (0.45 + 0.75 * inflow.coherence) * inflow.spinUp);
  vec3 emissivity = inflow.density * EMISSION_BRIGHTNESS *
    (blackbodyColor(normalizedTemperature * frequencyShift) * normalizedTemperature +
      CLUMP_BASE_GLOW_COLOR * CLUMP_BASE_GLOW);

  emission.radiance = emissivity * pow(frequencyShift, FREQUENCY_SHIFT_INTENSITY_EXPONENT) * properStepLength;
  emission.opticalDepth = MATTER_ABSORPTION_PER_DENSITY * inflow.density * properStepLength;
  emission.density = inflow.density * properStepLength;
  emission.frequencyShift = frequencyShift;
  return emission;
}
`;
