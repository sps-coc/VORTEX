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
  private randomNumberGenerator: () => number;

  constructor(
    config: SimulationConfig = defaultSimulationConfig,
    seed: number = 42,
  ) {
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
    this.randomNumberGenerator = createRng(seed);
  }

  private static validateConfig(config: SimulationConfig): void {
    if (config.initialMass < 0) throw new Error('initialMass must be >= 0');
    if (config.linearGrowthRate < 0)
      throw new Error('linearGrowthRate must be >= 0');
    if (config.pulseWidth <= 0) throw new Error('pulseWidth must be > 0');
    if (config.maxPackets < 0) throw new Error('maxPackets must be >= 0');
    if (config.spawnRadius <= 0) throw new Error('spawnRadius must be > 0');
  }

  /**
   * Advance the simulation by `deltaTime` seconds of real time.
   * Internally converts to advanced time: advancedTimeDelta = deltaTime × timeScale.
   * Does nothing when paused or when deltaTime ≤ 0.
   */
  public update(deltaTime: number): void {
    if (this.paused || deltaTime <= 0) return;

    const advancedTimeDelta = deltaTime * this.config.timeScale;
    this.advancedTime += advancedTimeDelta;

    // Analytic modes: set mass from M(v) formula
    if (this.config.massFunctionMode !== 'packet-driven') {
      this.blackHole.setMass(
        evaluateMassFunction(this.config, this.advancedTime),
      );
    }

    this.spawnPackets(advancedTimeDelta);
    this.movePackets(advancedTimeDelta);
    this.detectAbsorption();

    // Packet-driven mode: mass accumulates from absorbed packet energies
    if (this.config.massFunctionMode === 'packet-driven') {
      this.blackHole.setMass(
        this.config.initialMass + this.accumulatedAbsorbedEnergy,
      );
    }
  }

  private spawnPackets(advancedTimeDelta: number): void {
    this.spawnAccumulator += advancedTimeDelta * this.config.packetSpawnRate;

    while (
      this.spawnAccumulator >= 1 &&
      this.packets.length < this.config.maxPackets
    ) {
      this.spawnAccumulator -= 1;
      this.spawnPacket();
    }

    // When at capacity, drain the accumulator so there's no spawn burst after absorption
    if (this.packets.length >= this.config.maxPackets) {
      this.spawnAccumulator = 0;
    }
  }

  private spawnPacket(): void {
    const spawnAngleRadians = this.randomNumberGenerator() * 2 * Math.PI;
    const blackHolePosition = this.blackHole.getPosition();
    const spawnPosition = {
      x:
        blackHolePosition.x +
        Math.cos(spawnAngleRadians) * this.config.spawnRadius,
      y:
        blackHolePosition.y +
        Math.sin(spawnAngleRadians) * this.config.spawnRadius,
    };
    // Velocity: from spawn position toward the black hole center
    const directionToCenter = normalize(
      subtract(blackHolePosition, spawnPosition),
    );
    const velocity = scale(directionToCenter, this.config.packetSpeed);
    const packetId = String(this.nextPacketId++);
    this.packets.push(
      new EnergyPacket(
        packetId,
        spawnPosition,
        velocity,
        this.config.packetEnergy,
      ),
    );
  }

  private movePackets(advancedTimeDelta: number): void {
    for (const packet of this.packets) {
      packet.step(advancedTimeDelta);
    }
  }

  private detectAbsorption(): void {
    const horizonRadius = this.blackHole.getApparentHorizonRadius();
    const blackHolePosition = this.blackHole.getPosition();
    const surviving: EnergyPacket[] = [];

    for (const packet of this.packets) {
      const { position, energy } = packet.getState();
      if (isAbsorbed(position, blackHolePosition, horizonRadius)) {
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
    this.blackHole = new VaidyaBlackHole(this.initialConfig.initialMass, {
      x: 0,
      y: 0,
    });
    this.packets = [];
    this.advancedTime = 0;
    this.absorbedPacketCount = 0;
    this.accumulatedAbsorbedEnergy = 0;
    this.spawnAccumulator = 0;
    this.paused = false;
    this.nextPacketId = 0;
    this.randomNumberGenerator = createRng(this.seed);
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
      packets: this.packets.map((energyPacket) => energyPacket.getState()),
      absorbedPacketCount: this.absorbedPacketCount,
      config: { ...this.config },
    };
  }
}
