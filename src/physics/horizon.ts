export function apparentHorizonRadiusFromMass(mass: number): number {
    if (mass < 0) {
        throw new Error("Mass less than 0");
    }

	if (mass !== mass) {
		throw new Error("Mass is NaN");
	}

    return mass * 2;
}
