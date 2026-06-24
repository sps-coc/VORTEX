import type { SimulationConfig, SimulationSnapshot } from './types';
import { VaidyaBlackHole } from './VaidyaBlackHole';
import { EnergyPacket } from './EnergyPacket';
import { defaultSimulationConfig } from '../config/defaultSimulationConfig';
import { evaluateMassFunction } from '../physics/massFunction';
import { isAbsorbed } from '../physics/absorption';
import { normalize, scale, subtract } from '../utils/vector';
import { createRng } from '../utils/random';

export class Simulation {
  private config: SimulationConfig;
  private readonly initialConfig: SimulationConfig;
  private readonly seed: number;

  private blackHole: VaidyaBlackHole;
  private packets: EnergyPacket[];

  private advancedTime: number;
  private absorbedPacketCount: number;
  private accumulatedAbsorbedEnergy: number;
  private spawnAccumulator: number;
  private paused: boolean;
  private nextPacketId: number;
  private rng: () => number;

  constructor(config: SimulationConfig = defaultSimulationConfig, seed: number = 42) {
    Simulation.validateConfig(config);
    this.config = { ...config };
    this.initialConfig = { ...config };
    this.seed = seed;

    this.blackHole = new VaidyaBlackHole(config.initialMass, { x: 0, y: 0 });
    this.packets = [];
    this.advancedTime = 0;
    this.absorbedPacketCount = 0;
    this.accumulatedAbsorbedEnergy = 0;
    this.spawnAccumulator = 0;
    this.paused = false;
    this.nextPacketId = 0;
    this.rng = createRng(seed);
  }

  private static validateConfig(config: SimulationConfig): void {
    if (config.initialMass < 0) throw new Error('initialMass must be >= 0');
    if (config.linearGrowthRate < 0) throw new Error('linearGrowthRate must be >= 0');
    if (config.pulseWidth <= 0) throw new Error('pulseWidth must be > 0');
    if (config.maxPackets < 0) throw new Error('maxPackets must be >= 0');
    if (config.spawnRadius <= 0) throw new Error('spawnRadius must be > 0');
  }

  /**
   * Advance the simulation by `dt` seconds of real time.
   * Internally converts to advanced time: dv = dt × timeScale.
   * Does nothing when paused or when dt ≤ 0.
   */
  public update(dt: number): void {
    if (this.paused || dt <= 0) return;

    const dv = dt * this.config.timeScale;
    this.advancedTime += dv;

    // Analytic modes: set mass from M(v) formula
    if (this.config.massFunctionMode !== 'packet-driven') {
      this.blackHole.setMass(evaluateMassFunction(this.config, this.advancedTime));
    }

    this.spawnPackets(dv);
    this.movePackets(dv);
    this.detectAbsorption();

    // Packet-driven mode: mass accumulates from absorbed packet energies
    if (this.config.massFunctionMode === 'packet-driven') {
      this.blackHole.setMass(this.config.initialMass + this.accumulatedAbsorbedEnergy);
    }
  }

  private spawnPackets(dv: number): void {
    this.spawnAccumulator += dv * this.config.packetSpawnRate;

    while (this.spawnAccumulator >= 1 && this.packets.length < this.config.maxPackets) {
      this.spawnAccumulator -= 1;
      this.spawnPacket();
    }

    // When at capacity, drain the accumulator so there's no spawn burst after absorption
    if (this.packets.length >= this.config.maxPackets) {
      this.spawnAccumulator = 0;
    }
  }

  private spawnPacket(): void {
    const angle = this.rng() * 2 * Math.PI;
    const bhPos = this.blackHole.getPosition();
    const pos = {
      x: bhPos.x + Math.cos(angle) * this.config.spawnRadius,
      y: bhPos.y + Math.sin(angle) * this.config.spawnRadius,
    };
    // Velocity: from spawn position toward the black hole center
    const dir = normalize(subtract(bhPos, pos));
    const velocity = scale(dir, this.config.packetSpeed);
    const id = String(this.nextPacketId++);
    this.packets.push(new EnergyPacket(id, pos, velocity, this.config.packetEnergy));
  }

  private movePackets(dv: number): void {
    for (const packet of this.packets) {
      packet.step(dv);
    }
  }

  private detectAbsorption(): void {
    const horizonRadius = this.blackHole.getApparentHorizonRadius();
    const bhPos = this.blackHole.getPosition();
    const surviving: EnergyPacket[] = [];

    for (const packet of this.packets) {
      const { position, energy } = packet.getState();
      if (isAbsorbed(position, bhPos, horizonRadius)) {
        packet.markAbsorbed();
        this.absorbedPacketCount++;
        this.accumulatedAbsorbedEnergy += energy;
      } else {
        surviving.push(packet);
      }
    }

    this.packets = surviving;
  }

  public pause(): void {
    this.paused = true;
  }

  public resume(): void {
    this.paused = false;
  }

  public isPaused(): boolean {
    return this.paused;
  }

  /**
   * Reset the simulation to its initial state (same config and seed as construction).
   * Clears all packets, counters, and time. The RNG sequence restarts from the same seed.
   */
  public reset(): void {
    this.config = { ...this.initialConfig };
    this.blackHole = new VaidyaBlackHole(this.initialConfig.initialMass, { x: 0, y: 0 });
    this.packets = [];
    this.advancedTime = 0;
    this.absorbedPacketCount = 0;
    this.accumulatedAbsorbedEnergy = 0;
    this.spawnAccumulator = 0;
    this.paused = false;
    this.nextPacketId = 0;
    this.rng = createRng(this.seed);
  }

  /**
   * Merge a partial config override. Takes effect on the next update() call.
   * Use this for live parameter tuning.
   */
  public setConfig(partial: Partial<SimulationConfig>): void {
    this.config = { ...this.config, ...partial };
  }

  /**
   * Returns a plain snapshot of the current simulation state.
   * All objects are copies — mutating the snapshot has no effect on the simulation.
   */
  public getSnapshot(): SimulationSnapshot {
    return {
      advancedTime: this.advancedTime,
      blackHole: this.blackHole.getState(),
      packets: this.packets.map((p) => p.getState()),
      absorbedPacketCount: this.absorbedPacketCount,
      config: { ...this.config },
    };
  }
}
