export const geodesicIntegratorChunk = /* glsl */ `
// Null geodesics of the ingoing Kerr-Vaidya metric via the conformal Hamiltonian
// Htilde = rho^2 (1/2) g^{mu nu} p_mu p_nu
//        = 1/2 (a^2 sin^2(theta) p_v^2 + Delta p_r^2 + p_theta^2 + p_psi^2 / sin^2(theta))
//          + (r^2 + a^2) p_v p_r + a p_v p_psi + a p_r p_psi.
// p_psi is exactly conserved; the entire Vaidya modification is dp_v = M'(v) r p_r^2.
// Rays are integrated backward in time: the state momentum is q = -k of the received photon.

struct GeodesicRay {
  vec4 coordinates;
  vec4 momentum;
};

const float POLAR_SINE_FLOOR = 1.0e-4;

void evaluateGeodesicDerivatives(GeodesicRay ray, out vec4 positionRate, out vec4 momentumRate) {
  MassState massState = evaluateMass(ray.coordinates.x);
  float radius = ray.coordinates.y;
  float sine = sin(ray.coordinates.z);
  float cosine = cos(ray.coordinates.z);
  float safeSine = sine >= 0.0 ? max(sine, POLAR_SINE_FLOOR) : min(sine, -POLAR_SINE_FLOOR);
  float sineSquared = safeSine * safeSine;
  float radiusSpinSquared = radius * radius + spin * spin;
  float delta = radiusSpinSquared - 2.0 * massState.mass * radius;
  float timeMomentum = ray.momentum.x;
  float radialMomentum = ray.momentum.y;
  float azimuthalMomentum = ray.momentum.w;

  positionRate = vec4(
    spin * spin * sineSquared * timeMomentum + radiusSpinSquared * radialMomentum + spin * azimuthalMomentum,
    radiusSpinSquared * timeMomentum + delta * radialMomentum + spin * azimuthalMomentum,
    ray.momentum.z,
    spin * (timeMomentum + radialMomentum) + azimuthalMomentum / sineSquared
  );
  momentumRate = vec4(
    massState.derivative * radius * radialMomentum * radialMomentum,
    -2.0 * radius * timeMomentum * radialMomentum - (radius - massState.mass) * radialMomentum * radialMomentum,
    cosine * (azimuthalMomentum * azimuthalMomentum / (sineSquared * safeSine)
      - spin * spin * safeSine * timeMomentum * timeMomentum),
    0.0
  );
}

const float INTEGRATION_ARC_FRACTION = 0.07;
const float HORIZON_APPROACH_FRACTION = 0.9;
const float NEAR_HORIZON_ARC_FLOOR = 0.02;
const float MINIMAL_CONFORMAL_SPEED = 1.0e-12;
const float POLAR_GUARD_BAND_SINE = 0.25;
const float POLAR_GUARD_MINIMUM_FACTOR = 0.02;

// arcLength returns the spatial arc the step will cover — the emission integral uses
// it as the path-length measure, so it is computed once here rather than twice.
float chooseStepSize(GeodesicRay ray, vec4 positionRate, float horizonRadius, out float arcLength) {
  float radius = ray.coordinates.y;
  float sine = sin(ray.coordinates.z);
  float spatialSpeed = length(vec3(
    positionRate.y,
    radius * positionRate.z,
    radius * sine * positionRate.w
  ));
  float targetArcLength = INTEGRATION_ARC_FRACTION *
    min(radius, max(radius - HORIZON_APPROACH_FRACTION * horizonRadius, NEAR_HORIZON_ARC_FLOOR));
  // The p_psi^2 / sin^3(theta) polar terms are stiff near the spin axis; rays that
  // carry azimuthal momentum through that region need finer steps to stay accurate.
  if (ray.momentum.w != 0.0) {
    targetArcLength *= clamp(abs(sine) / POLAR_GUARD_BAND_SINE, POLAR_GUARD_MINIMUM_FACTOR, 1.0);
  }
  arcLength = targetArcLength;
  return targetArcLength / max(spatialSpeed, MINIMAL_CONFORMAL_SPEED);
}

// The first RK4 slope is taken as a parameter because the caller already computed it
// for step-size selection — recomputing it would waste a quarter of the derivative
// evaluations in the hottest loop of the renderer.
GeodesicRay advanceGeodesic(GeodesicRay ray, float stepSize, vec4 positionSlopeOne, vec4 momentumSlopeOne) {
  vec4 positionSlopeTwo, momentumSlopeTwo;
  vec4 positionSlopeThree, momentumSlopeThree;
  vec4 positionSlopeFour, momentumSlopeFour;
  float halfStep = 0.5 * stepSize;

  evaluateGeodesicDerivatives(
    GeodesicRay(ray.coordinates + halfStep * positionSlopeOne, ray.momentum + halfStep * momentumSlopeOne),
    positionSlopeTwo, momentumSlopeTwo);
  evaluateGeodesicDerivatives(
    GeodesicRay(ray.coordinates + halfStep * positionSlopeTwo, ray.momentum + halfStep * momentumSlopeTwo),
    positionSlopeThree, momentumSlopeThree);
  evaluateGeodesicDerivatives(
    GeodesicRay(ray.coordinates + stepSize * positionSlopeThree, ray.momentum + stepSize * momentumSlopeThree),
    positionSlopeFour, momentumSlopeFour);

  return GeodesicRay(
    ray.coordinates + (stepSize / 6.0) *
      (positionSlopeOne + 2.0 * positionSlopeTwo + 2.0 * positionSlopeThree + positionSlopeFour),
    ray.momentum + (stepSize / 6.0) *
      (momentumSlopeOne + 2.0 * momentumSlopeTwo + 2.0 * momentumSlopeThree + momentumSlopeFour)
  );
}

// |Htilde| normalized by its largest term, so tolerances are scale-free.
float nullConstraintError(GeodesicRay ray) {
  MassState massState = evaluateMass(ray.coordinates.x);
  float radius = ray.coordinates.y;
  float sine = sin(ray.coordinates.z);
  float sineSquared = max(sine * sine, POLAR_SINE_FLOOR * POLAR_SINE_FLOOR);
  float delta = radius * radius + spin * spin - 2.0 * massState.mass * radius;
  float termOne = 0.5 * spin * spin * sineSquared * ray.momentum.x * ray.momentum.x;
  float termTwo = 0.5 * delta * ray.momentum.y * ray.momentum.y;
  float termThree = 0.5 * ray.momentum.z * ray.momentum.z;
  float termFour = 0.5 * ray.momentum.w * ray.momentum.w / sineSquared;
  float termFive = (radius * radius + spin * spin) * ray.momentum.x * ray.momentum.y;
  float termSix = spin * ray.momentum.x * ray.momentum.w;
  float termSeven = spin * ray.momentum.y * ray.momentum.w;
  float scale = max(max(max(abs(termOne), abs(termTwo)), max(abs(termThree), abs(termFour))),
    max(max(abs(termFive), abs(termSix)), abs(termSeven)));
  return abs(termOne + termTwo + termThree + termFour + termFive + termSix + termSeven) / max(scale, 1.0e-30);
}
`;
