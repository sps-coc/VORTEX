export function apparentHorizonRadiusFromMass(mass:number):number{
    if(mass < 0){
        throw new Error("Mass less than 0");
    }
    return mass*2;
}