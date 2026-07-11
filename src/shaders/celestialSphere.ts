export const celestialSphereChunk = /* glsl */ `
// Deep-space backdrop: two layers of gaussian point stars (jittered cell centers,
// restricted so a single cell lookup suffices) over a tilted galactic band with dust
// lanes and a core glow. Anti-aliased by construction: each star is a smooth disc of
// roughly pixel scale, so magnification stretches them into arcs instead of squares.

const float BRIGHT_STAR_CELLS = 15.0;
const float FAINT_STAR_CELLS = 52.0;
const float BRIGHT_STAR_DENSITY = 0.22;
const float FAINT_STAR_DENSITY = 0.35;
const float BRIGHT_STAR_INTENSITY = 5.5;
const float FAINT_STAR_INTENSITY = 1.1;
const float STAR_RADIUS_CELL_FRACTION = 0.055;
const vec3 GALAXY_PLANE_NORMAL = normalize(vec3(0.32, 0.84, 0.44));
const vec3 GALAXY_CORE_DIRECTION = normalize(vec3(0.88, 0.10, -0.46));
const float GALAXY_BAND_WIDTH = 0.16;
const float GALAXY_CORE_GLOW_POWER = 5.0;

vec3 starTemperatureColor(float temperatureSample) {
  vec3 cool = vec3(1.0, 0.72, 0.48);
  vec3 solar = vec3(1.0, 0.96, 0.88);
  vec3 hot = vec3(0.72, 0.82, 1.0);
  return temperatureSample < 0.5
    ? mix(cool, solar, temperatureSample * 2.0)
    : mix(solar, hot, temperatureSample * 2.0 - 1.0);
}

float starLayer(vec3 direction, float cellCount, float density, out float temperatureSample) {
  vec3 scaled = direction * cellCount;
  vec3 cell = floor(scaled);
  float gate = hash31(cell + 41.7);
  temperatureSample = hash31(cell + 93.1);
  if (gate > density) return 0.0;
  // Jitter restricted to [0.3, 0.7] keeps each star fully inside its own cell.
  vec3 starPosition = cell + 0.3 + 0.4 * vec3(hash31(cell), hash31(cell + 17.0), hash31(cell + 29.0));
  float distanceToStar = length(scaled - starPosition);
  float radius = STAR_RADIUS_CELL_FRACTION * (0.6 + 1.2 * hash31(cell + 5.0));
  float brightness = hash31(cell + 61.0);
  return exp(-distanceToStar * distanceToStar / (radius * radius)) * brightness * brightness;
}

vec3 galaxyBand(vec3 direction) {
  float latitude = dot(direction, GALAXY_PLANE_NORMAL);
  float band = exp(-latitude * latitude / (GALAXY_BAND_WIDTH * GALAXY_BAND_WIDTH));
  if (band < 0.01) return vec3(0.0);

  float clouds = fractalNoise(direction * 5.0 + 3.7);
  float wisps = fractalNoise(direction * 11.0 - 8.2);
  float dust = fractalNoise(direction * 8.0 + vec3(0.0, 40.0, 0.0));
  float dustLane = smoothstep(0.42, 0.72, dust) * exp(-latitude * latitude / (0.35 * GALAXY_BAND_WIDTH * GALAXY_BAND_WIDTH));

  float coreAlignment = max(dot(direction, GALAXY_CORE_DIRECTION), 0.0);
  float coreGlow = pow(coreAlignment, GALAXY_CORE_GLOW_POWER);

  vec3 diffuseGlow = mix(vec3(0.20, 0.22, 0.32), vec3(0.45, 0.36, 0.26), clouds) * (0.35 + 0.65 * wisps);
  vec3 coreColor = vec3(0.85, 0.66, 0.42) * coreGlow * (1.6 + clouds);
  return band * (diffuseGlow + coreColor) * (1.0 - 0.85 * dustLane);
}

vec3 celestialSphereRadiance(vec3 direction) {
  float brightTemperature;
  float faintTemperature;
  float bright = starLayer(direction, BRIGHT_STAR_CELLS, BRIGHT_STAR_DENSITY, brightTemperature);
  float faint = starLayer(direction, FAINT_STAR_CELLS, FAINT_STAR_DENSITY, faintTemperature);

  vec3 stars = bright * BRIGHT_STAR_INTENSITY * starTemperatureColor(brightTemperature)
    + faint * FAINT_STAR_INTENSITY * starTemperatureColor(faintTemperature);
  vec3 deepSpace = vec3(0.012, 0.015, 0.026) * (0.7 + 0.6 * fractalNoise(direction * 3.0));
  return deepSpace + galaxyBand(direction) + stars;
}
`;
