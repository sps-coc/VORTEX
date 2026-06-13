export interface Vector {
    x: number;
    y: number;
}

export function distance(a:Vector,b:Vector):number{
    const xd:number = a.x-b.x;
    const yd:number = a.y-b.y;
    return Math.sqrt(xd**2+yd**2);
}

export function add(a:Vector,b:Vector):Vector{
    return{
        x: a.x + b.x,
        y: a.y + b.y
    }
}

export function scale(v:Vector,s:number):Vector{
    return{
        x: v.x*s,
        y: v.y*s
    }
}

export function normalize(a:Vector):Vector{
    const mag: number = Math.sqrt(a.x**2+a.y**2);
    if (mag == 0){
        return {
            x: 0,
            y: 0
        }
    }
    return {
        x: a.x / mag,
        y: a.y / mag
    }
}

