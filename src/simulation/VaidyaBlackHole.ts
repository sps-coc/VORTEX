import type { Vector2, VaidyaBlackHoleState } from "./types"
import { apparentHorizonRadiusFromMass } from "../physics/horizon";


export class VaidyaBlackHole {
    private mass: number;
    private position: Vector2;

    constructor(mass: number, position: Vector2) {
        if (mass < 0) {
            throw new Error("mass less than zero");
        }

        this.mass = mass;
        this.position = {
            x: position.x,
			y: position.y
        };
    }

    public getMass():number {
        return this.mass;
    }

    public setMass(mass: number) {
        if (mass < 0){
            throw new Error("mass less than zero");
        }

		if (mass !== mass) {
			throw new Error("mass is NaN");
		}

        this.mass = mass;
    }

    public addMass(mass: number) {
        this.mass += mass;
    }

    public getApparentHorizonRadius(): number {
        return apparentHorizonRadiusFromMass(this.mass);
    }

    public getPosition(): Vector2 {
        return {
            x: this.position.x,
            y: this.position.y
        };
    }

    public getState(): VaidyaBlackHoleState {
        return {
            mass: this.mass,
            position: this.position,
            apparentHorizonRadius: this.getApparentHorizonRadius()
        };
    }
}
