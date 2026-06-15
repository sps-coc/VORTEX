export interface Vector {
	x: number;
	y: number;
}

export function distance(vect1: Vector, vect2: Vector): number {
	const xDistance: number = vect2.x - vect1.x;
	const yDistance: number = vect2.y - vect1.y;

	return Math.sqrt(xDistance**2 + yDistance**2);
}

export function add(vect1: Vector, vect2: Vector): Vector {
	return {
		x: vect1.x + vect2.x,
		y: vect1.y + vect2.y
	};
}

export function scale(vect: Vector, scalar: number): Vector {
	return {
		x: scalar * vect.x,
		y: scalar * vect.y
	};
}

export function normalize(vect: Vector): Vector {
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

