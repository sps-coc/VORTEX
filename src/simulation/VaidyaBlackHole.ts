import {Vector} from "../utils/vector";
import {apparentHorizonRadiusFromMass} from "../physics/horizon";

export interface BlackHoleState{
    mass: number;
    position: Vector;
    radius: number;
}

export class VaidyaBlackHole{
    private mass: number;
    private position: Vector;

    constructor(mass: number, position: Vector) {
        if(mass < 0){
            throw new Error("mass less than zero");
        }
        this.mass = mass;
        this.position ={
            x: position.x,y: position.y
        };
    }

    public getMass():number{
        return this.mass;
    }

    public setMass(mass: number) {
        if(mass < 0){
            throw new Error("mass less than zero");
        }
        this.mass = mass;
    }

    public addMass(mass: number) {
        this.mass += mass;
    }

    public getApparentHorizonRadius():number{
        return apparentHorizonRadiusFromMass(this.mass);
    }

    public getPosition(): Vector{
        return {
            x: this.position.x,
            y: this.position.y
        };
    }

    public getState(): BlackHoleState{
        return {
            mass: this.mass,
            position: this.position,
            radius: this.getApparentHorizonRadius()
        };
    }

}