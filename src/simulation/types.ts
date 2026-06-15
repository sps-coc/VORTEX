export interface Vector2 {
  x: number;
  y: number;
}

export type MassFunctionMode =
  | 'constant'
  | 'linear'
  | 'smooth-pulse'
  | 'packet-driven';

export interface VaidyaBlackHoleState {
  mass: number;
  apparentHorizonRadius: number;
  position: Vector2;
}

export interface EnergyPacketState {
  id: string;
  position: Vector2;
  velocity: Vector2;
  energy: number;
  absorbed: boolean;
}

export interface SimulationConfig {
  initialMass: number;
  massFunctionMode: MassFunctionMode;
  linearGrowthRate: number;
  pulseDeltaMass: number;
  pulseCenter: number;
  pulseWidth: number;
  packetEnergy: number;
  packetSpawnRate: number;
  packetSpeed: number;
  spawnRadius: number;
  timeScale: number;
  maxPackets: number;
}

export interface SimulationSnapshot {
  advancedTime: number;
  blackHole: VaidyaBlackHoleState;
  packets: EnergyPacketState[];
  absorbedPacketCount: number;
  config: SimulationConfig;
}
