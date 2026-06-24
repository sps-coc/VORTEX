import type { SimulationConfig } from '../simulation/types';

export const defaultSimulationConfig: SimulationConfig = {
  initialMass: 1,
  massFunctionMode: 'linear',
  linearGrowthRate: 0.05,
  pulseDeltaMass: 1,
  pulseCenter: 10,
  pulseWidth: 2,
  packetEnergy: 0.01,
  packetSpawnRate: 5,
  packetSpeed: 1,
  spawnRadius: 12,
  timeScale: 1,
  maxPackets: 300,
};

export const parameterRanges = {
  initialMass: { min: 0.1, max: 10, step: 0.1 },
  linearGrowthRate: { min: 0, max: 1, step: 0.01 },
  pulseDeltaMass: { min: 0, max: 10, step: 0.1 },
  pulseCenter: { min: 0, max: 100, step: 1 },
  pulseWidth: { min: 0.1, max: 20, step: 0.1 },
  packetEnergy: { min: 0.001, max: 1, step: 0.001 },
  packetSpawnRate: { min: 0, max: 50, step: 1 },
  packetSpeed: { min: 0.1, max: 10, step: 0.1 },
  spawnRadius: { min: 1, max: 100, step: 1 },
  timeScale: { min: 0.1, max: 10, step: 0.1 },
  maxPackets: { min: 0, max: 1000, step: 10 },
};
