export { HorizonSampleCount as HorizonShapeSampleCount } from "../physics/apparentHorizon.ts";

export const spacetimeGeometryChunk = /* glsl */ `
struct MassState {
  float mass;
  float derivative;
};

MassState evaluateMass(float advancedTime) {
  float softening = max(smoothingTime, 1.0e-3);
  float softenedTime = sqrt(advancedTime * advancedTime + softening * softening);
  return MassState(
    initialMass + accretionRate * (advancedTime + softenedTime),
    accretionRate * (1.0 + advancedTime / softenedTime)
  );
}

float outerKerrRadius(float mass) {
  float boundedSpin = min(abs(spin), mass * 0.999999);
  return mass + sqrt(max(mass * mass - boundedSpin * boundedSpin, 0.0));
}

// r_+(v, theta) = r0(M(v)) + M'(v) * shape(theta); the shape (correction per unit
// mass-accretion rate) is solved on the CPU once per frame and is <= 0 for accretion.
float apparentHorizonRadius(float polarAngle, MassState massState) {
  float foldedAngle = abs(mod(polarAngle, TWO_PI));
  foldedAngle = min(foldedAngle, TWO_PI - foldedAngle);
  float samplePosition = clamp(foldedAngle / PI, 0.0, 1.0) * float(HORIZON_SHAPE_SAMPLES - 1);
  int lowerIndex = int(floor(samplePosition));
  int upperIndex = min(lowerIndex + 1, HORIZON_SHAPE_SAMPLES - 1);
  float shape = mix(horizonShapePerMassRate[lowerIndex], horizonShapePerMassRate[upperIndex], fract(samplePosition));
  return outerKerrRadius(massState.mass) + massState.derivative * shape;
}
`;
