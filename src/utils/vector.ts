import type { Vector2 } from "../simulation/types";

export function distance(vect1: Vector2, vect2: Vector2): number {
	const xDistance: number = vect2.x - vect1.x;
	const yDistance: number = vect2.y - vect1.y;

	return Math.sqrt(xDistance**2 + yDistance**2);
}

export function add(vect1: Vector2, vect2: Vector2): Vector2 {
	return {
		x: vect1.x + vect2.x,
		y: vect1.y + vect2.y
	};
}

export function scale(vect: Vector2, scalar: number): Vector2 {
	return {
		x: scalar * vect.x,
		y: scalar * vect.y
	};
}

export function normalize(vect: Vector2): Vector2 {
	const mag: number = Math.sqrt(vect.x**2 + vect.y**2);

	if (mag == 0){
		return {
			x: 0,
			y: 0
		};
	}

    return {
        x: vect.x / mag,
        y: vect.y / mag
    };
}

