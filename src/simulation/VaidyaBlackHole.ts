import type { Vector2, VaidyaBlackHoleState } from './types';
import { apparentHorizonRadiusFromMass } from '../physics/horizon';

export class VaidyaBlackHole {
  private mass: number;
  private position: Vector2;

  constructor(mass: number, position: Vector2) {
    if (mass < 0) {
      throw new Error('mass less than zero');
    }

    this.mass = mass;
    this.position = {
      x: position.x,
      y: position.y,
    };
  }

  public getMass(): number {
    return this.mass;
  }

  public setMass(mass: number) {
    if (mass < 0) {
      throw new Error('mass less than zero');
    }

    if (mass !== mass) {
      throw new Error('mass is NaN');
    }

    this.mass = mass;
  }

  public addMass(massDelta: number) {
    if (massDelta !== massDelta) {
      throw new Error('massDelta is NaN');
    }

    if (this.mass + massDelta < 0) {
      throw new Error('resulting mass less than zero');
    }

    this.mass += massDelta;
  }

  public getApparentHorizonRadius(): number {
    return apparentHorizonRadiusFromMass(this.mass);
  }

  public getPosition(): Vector2 {
    return {
      x: this.position.x,
      y: this.position.y,
    };
  }

  public getState(): VaidyaBlackHoleState {
    return {
      mass: this.mass,
      position: { x: this.position.x, y: this.position.y },
      apparentHorizonRadius: this.getApparentHorizonRadius(),
    };
  }
}
