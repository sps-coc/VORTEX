export interface MassState {
  mass: number;
  massDerivative: number;
  advancedTime: number;
}

export interface MassFunctionParameters {
  initialMass: number;
  accretionRate: number;
  smoothingTime: number;
}

export function evaluateMassFunction(
  advancedTime: number,
  parameters: MassFunctionParameters
): MassState {
  const smooth = Math.max(parameters.smoothingTime, 1e-3);
  const softenedTime = Math.sqrt(advancedTime * advancedTime + smooth * smooth);
  const monotoneClock = advancedTime + softenedTime;
  const derivative = parameters.accretionRate * (1 + advancedTime / softenedTime);

  return {
    advancedTime,
    mass: parameters.initialMass + parameters.accretionRate * monotoneClock,
    massDerivative: derivative
  };
}
