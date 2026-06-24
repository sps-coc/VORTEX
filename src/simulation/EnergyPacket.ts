import type { EnergyPacketState, Vector2 } from './types';
import { add, scale } from '../utils/vector';

export class EnergyPacket {
  private readonly id: string;
  private position: Vector2;
  private readonly velocity: Vector2;
  private readonly energy: number;
  private absorbed: boolean;

  constructor(id: string, position: Vector2, velocity: Vector2, energy: number) {
    this.id = id;
    this.position = { x: position.x, y: position.y };
    this.velocity = { x: velocity.x, y: velocity.y };
    this.energy = energy;
    this.absorbed = false;
  }

  /**
   * Advance the packet's position by one time step.
   * Does nothing if the packet has already been absorbed.
   */
  public step(dt: number): void {
    if (this.absorbed) return;
    this.position = add(this.position, scale(this.velocity, dt));
  }

  /** Mark the packet as absorbed. Idempotent. */
  public markAbsorbed(): void {
    this.absorbed = true;
  }

  /** Returns true if the packet has been absorbed. */
  public isAbsorbed(): boolean {
    return this.absorbed;
  }

  /** Returns a snapshot of the packet's state (all fields are copied — no ref leaks). */
  public getState(): EnergyPacketState {
    return {
      id: this.id,
      position: { x: this.position.x, y: this.position.y },
      velocity: { x: this.velocity.x, y: this.velocity.y },
      energy: this.energy,
      absorbed: this.absorbed,
    };
  }
}
