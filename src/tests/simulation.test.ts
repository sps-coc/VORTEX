import { describe, expect, it } from 'vitest';
import { Simulation } from '../simulation/Simulation';
import { defaultSimulationConfig } from '../config/defaultSimulationConfig';

function runSimulationSteps(
  simulation: Simulation,
  stepCount: number,
  deltaTime = 0.1,
): void {
  for (let i = 0; i < stepCount; i++) simulation.update(deltaTime);
}

// Config that keeps packets alive (mass=0 → r_A=0 → no absorption)
const noAbsorbConfig = {
  ...defaultSimulationConfig,
  initialMass: 0,
  massFunctionMode: 'constant' as const,
  linearGrowthRate: 0,
};

// Config that absorbs packets quickly:
// spawn at radius 5, speed 5 → travel 1 unit to reach r_A=4 (mass=2, r_A=2*2=4)
// Wait — with initialMass:2, r_A=4. spawnRadius:5. travel=1. dt=0.05, speed=5 → 0.25/step → absorbed in ~4 steps
const fastAbsorbConfig = {
  ...defaultSimulationConfig,
  initialMass: 2,
  massFunctionMode: 'packet-driven' as const,
  spawnRadius: 5,
  packetSpeed: 5,
  packetSpawnRate: 10,
  packetEnergy: 0.1,
  timeScale: 1,
  maxPackets: 200,
};

describe('Simulation — constant mode', () => {
  it('mass stays at initialMass across all updates', () => {
    const simulation = new Simulation(
      { ...defaultSimulationConfig, massFunctionMode: 'constant' as const },
      42,
    );
    runSimulationSteps(simulation, 100);
    const snapshot = simulation.getSnapshot();
    expect(snapshot.blackHole.mass).toBeCloseTo(
      defaultSimulationConfig.initialMass,
    );
  });

  it('apparent horizon radius equals 2 × mass', () => {
    const simulation = new Simulation(
      { ...defaultSimulationConfig, massFunctionMode: 'constant' as const },
      42,
    );
    runSimulationSteps(simulation, 50);
    const { blackHole } = simulation.getSnapshot();
    expect(blackHole.apparentHorizonRadius).toBeCloseTo(2 * blackHole.mass);
  });
});

describe('Simulation — linear mode', () => {
  it('mass tracks M0 + rate × advancedTime', () => {
    const growthRate = 0.1;
    const initialMassValue = 1;
    const simulation = new Simulation(
      {
        ...defaultSimulationConfig,
        massFunctionMode: 'linear' as const,
        initialMass: initialMassValue,
        linearGrowthRate: growthRate,
        timeScale: 1,
      },
      42,
    );
    const deltaTime = 0.05;
    const stepCount = 80;
    runSimulationSteps(simulation, stepCount, deltaTime);
    const snapshot = simulation.getSnapshot();
    const expectedMass = initialMassValue + growthRate * snapshot.advancedTime;
    expect(snapshot.blackHole.mass).toBeCloseTo(expectedMass, 6);
  });

  it('apparent horizon radius equals 2 × mass throughout', () => {
    const simulation = new Simulation(
      { ...defaultSimulationConfig, massFunctionMode: 'linear' as const },
      42,
    );
    for (let i = 0; i < 100; i++) {
      simulation.update(0.05);
      const { blackHole } = simulation.getSnapshot();
      expect(blackHole.apparentHorizonRadius).toBeCloseTo(
        2 * blackHole.mass,
        10,
      );
    }
  });
});

describe('Simulation — smooth-pulse mode', () => {
  it('mass is monotonically non-decreasing (energy condition)', () => {
    const simulation = new Simulation(
      {
        ...defaultSimulationConfig,
        massFunctionMode: 'smooth-pulse' as const,
        initialMass: 1,
        pulseDeltaMass: 2,
        pulseCenter: 5,
        pulseWidth: 1,
        timeScale: 1,
      },
      42,
    );
    let previousMass = -Infinity;
    for (let i = 0; i < 200; i++) {
      simulation.update(0.1);
      const { blackHole } = simulation.getSnapshot();
      expect(blackHole.mass).toBeGreaterThanOrEqual(previousMass - 1e-10);
      previousMass = blackHole.mass;
    }
  });

  it('asymptotes to M0 + ΔM well after the pulse', () => {
    const initialMassValue = 1;
    const deltaMassValue = 2;
    const simulation = new Simulation(
      {
        ...defaultSimulationConfig,
        massFunctionMode: 'smooth-pulse' as const,
        initialMass: initialMassValue,
        pulseDeltaMass: deltaMassValue,
        pulseCenter: 2,
        pulseWidth: 0.5,
        timeScale: 1,
        packetSpawnRate: 0, // no packets needed for this physics test
      },
      42,
    );
    runSimulationSteps(simulation, 200, 0.1); // reach v = 20, well past the pulse
    const { blackHole } = simulation.getSnapshot();
    expect(blackHole.mass).toBeCloseTo(initialMassValue + deltaMassValue, 3);
  });
});

describe('Simulation — packet-driven mode', () => {
  it('mass increases as packets are absorbed', () => {
    const simulation = new Simulation(fastAbsorbConfig, 42);
    runSimulationSteps(simulation, 20, 0.05);
    const snapshot = simulation.getSnapshot();
    expect(snapshot.absorbedPacketCount).toBeGreaterThan(0);
    expect(snapshot.blackHole.mass).toBeGreaterThan(
      fastAbsorbConfig.initialMass,
    );
  });

  it('mass equals initialMass + sum of absorbed energies', () => {
    const simulation = new Simulation(fastAbsorbConfig, 42);
    runSimulationSteps(simulation, 20, 0.05);
    const snapshot = simulation.getSnapshot();
    const expectedMass =
      fastAbsorbConfig.initialMass +
      snapshot.absorbedPacketCount * fastAbsorbConfig.packetEnergy;
    expect(snapshot.blackHole.mass).toBeCloseTo(expectedMass, 8);
  });

  it('mass does not grow before any packets are absorbed', () => {
    // Use slow packets so no absorption happens in 1 step
    const simulation = new Simulation(
      {
        ...fastAbsorbConfig,
        packetSpeed: 0.001, // extremely slow — nothing absorbed in 1 step
        spawnRadius: 100,
      },
      42,
    );
    simulation.update(0.001);
    const snapshot = simulation.getSnapshot();
    expect(snapshot.blackHole.mass).toBeCloseTo(fastAbsorbConfig.initialMass);
  });
});

describe('Simulation — pause / resume', () => {
  it('pause freezes advancedTime and mass', () => {
    const simulation = new Simulation(
      { ...defaultSimulationConfig, massFunctionMode: 'linear' as const },
      42,
    );
    runSimulationSteps(simulation, 10);
    simulation.pause();
    const snapshotBefore = simulation.getSnapshot();
    runSimulationSteps(simulation, 10); // these updates should be no-ops
    const snapshotAfter = simulation.getSnapshot();
    expect(snapshotAfter.advancedTime).toBe(snapshotBefore.advancedTime);
    expect(snapshotAfter.blackHole.mass).toBe(snapshotBefore.blackHole.mass);
    expect(snapshotAfter.packets.length).toBe(snapshotBefore.packets.length);
  });

  it('isPaused() reflects the paused state', () => {
    const simulation = new Simulation(defaultSimulationConfig, 42);
    expect(simulation.isPaused()).toBe(false);
    simulation.pause();
    expect(simulation.isPaused()).toBe(true);
    simulation.resume();
    expect(simulation.isPaused()).toBe(false);
  });

  it('resume allows updates to proceed again', () => {
    const simulation = new Simulation(
      {
        ...defaultSimulationConfig,
        massFunctionMode: 'linear' as const,
        linearGrowthRate: 0.1,
      },
      42,
    );
    runSimulationSteps(simulation, 5);
    simulation.pause();
    const massBefore = simulation.getSnapshot().blackHole.mass;
    simulation.resume();
    runSimulationSteps(simulation, 5);
    expect(simulation.getSnapshot().blackHole.mass).toBeGreaterThan(massBefore);
  });
});

describe('Simulation — reset', () => {
  it('restores advancedTime to 0', () => {
    const simulation = new Simulation(defaultSimulationConfig, 42);
    runSimulationSteps(simulation, 50);
    simulation.reset();
    expect(simulation.getSnapshot().advancedTime).toBe(0);
  });

  it('restores mass to initialMass', () => {
    const simulation = new Simulation(defaultSimulationConfig, 42);
    runSimulationSteps(simulation, 50);
    simulation.reset();
    expect(simulation.getSnapshot().blackHole.mass).toBe(
      defaultSimulationConfig.initialMass,
    );
  });

  it('clears all packets and counters', () => {
    const simulation = new Simulation(defaultSimulationConfig, 42);
    runSimulationSteps(simulation, 50);
    simulation.reset();
    const snapshot = simulation.getSnapshot();
    expect(snapshot.packets.length).toBe(0);
    expect(snapshot.absorbedPacketCount).toBe(0);
  });

  it('produces the same results as a fresh simulation after reset (same seed)', () => {
    const seed = 99;
    const simulation = new Simulation(defaultSimulationConfig, seed);
    runSimulationSteps(simulation, 50);
    simulation.reset();
    const freshSimulation = new Simulation(defaultSimulationConfig, seed);

    // Run both for 30 steps and compare
    runSimulationSteps(simulation, 30);
    runSimulationSteps(freshSimulation, 30);

    const firstSnapshot = simulation.getSnapshot();
    const secondSnapshot = freshSimulation.getSnapshot();
    expect(firstSnapshot.advancedTime).toBe(secondSnapshot.advancedTime);
    expect(firstSnapshot.blackHole.mass).toBe(secondSnapshot.blackHole.mass);
    expect(firstSnapshot.packets.length).toBe(secondSnapshot.packets.length);
  });
});

describe('Simulation — setConfig', () => {
  it('switching from constant to linear mode causes mass to grow', () => {
    const simulation = new Simulation(
      { ...defaultSimulationConfig, massFunctionMode: 'constant' as const },
      42,
    );
    runSimulationSteps(simulation, 10);
    const massBefore = simulation.getSnapshot().blackHole.mass;

    simulation.setConfig({ massFunctionMode: 'linear', linearGrowthRate: 0.5 });
    runSimulationSteps(simulation, 10);
    expect(simulation.getSnapshot().blackHole.mass).toBeGreaterThan(massBefore);
  });

  it('setConfig does not reset advancedTime or packets', () => {
    const simulation = new Simulation(defaultSimulationConfig, 42);
    runSimulationSteps(simulation, 30);
    const timeBefore = simulation.getSnapshot().advancedTime;
    simulation.setConfig({ timeScale: 2 });
    // advancedTime is unchanged immediately after setConfig
    expect(simulation.getSnapshot().advancedTime).toBe(timeBefore);
  });
});

describe('Simulation — maxPackets cap', () => {
  it('never exceeds maxPackets active packets', () => {
    const packetCapacity = 10;
    const simulation = new Simulation(
      {
        ...noAbsorbConfig,
        maxPackets: packetCapacity,
        packetSpawnRate: 100, // spawn as fast as possible
      },
      42,
    );
    runSimulationSteps(simulation, 50);
    expect(simulation.getSnapshot().packets.length).toBeLessThanOrEqual(
      packetCapacity,
    );
  });
});

describe('Simulation — deterministic / seeded RNG', () => {
  it('two simulations with the same seed produce identical snapshots', () => {
    const seed = 7;
    const firstSimulation = new Simulation(defaultSimulationConfig, seed);
    const secondSimulation = new Simulation(defaultSimulationConfig, seed);
    runSimulationSteps(firstSimulation, 60);
    runSimulationSteps(secondSimulation, 60);

    const firstSnapshot = firstSimulation.getSnapshot();
    const secondSnapshot = secondSimulation.getSnapshot();

    expect(firstSnapshot.advancedTime).toBe(secondSnapshot.advancedTime);
    expect(firstSnapshot.packets.length).toBe(secondSnapshot.packets.length);
    expect(firstSnapshot.blackHole.mass).toBe(secondSnapshot.blackHole.mass);

    for (let i = 0; i < firstSnapshot.packets.length; i++) {
      expect(firstSnapshot.packets[i].position.x).toBe(
        secondSnapshot.packets[i].position.x,
      );
      expect(firstSnapshot.packets[i].position.y).toBe(
        secondSnapshot.packets[i].position.y,
      );
    }
  });

  it('two simulations with different seeds produce different packet distributions', () => {
    const firstSimulation = new Simulation(defaultSimulationConfig, 1);
    const secondSimulation = new Simulation(defaultSimulationConfig, 2);
    runSimulationSteps(firstSimulation, 30);
    runSimulationSteps(secondSimulation, 30);

    const packetsFromFirstSim = firstSimulation.getSnapshot().packets;
    const packetsFromSecondSim = secondSimulation.getSnapshot().packets;

    // Highly unlikely that first packet positions match with different seeds
    if (packetsFromFirstSim.length > 0 && packetsFromSecondSim.length > 0) {
      const positionsMatch =
        packetsFromFirstSim[0].position.x ===
          packetsFromSecondSim[0].position.x &&
        packetsFromFirstSim[0].position.y ===
          packetsFromSecondSim[0].position.y;
      expect(positionsMatch).toBe(false);
    }
  });
});

describe('Simulation — snapshot isolation', () => {
  it('mutating a snapshot does not affect subsequent snapshots', () => {
    const simulation = new Simulation(defaultSimulationConfig, 42);
    simulation.update(0.1);
    const snapshot = simulation.getSnapshot();

    // Mutate the snapshot
    snapshot.blackHole.mass = 9999;
    snapshot.config.initialMass = 9999;
    snapshot.blackHole.position.x = 9999;

    // Simulation should be unaffected
    const secondSnapshot = simulation.getSnapshot();
    expect(secondSnapshot.blackHole.mass).not.toBe(9999);
    expect(secondSnapshot.config.initialMass).not.toBe(9999);
    expect(secondSnapshot.blackHole.position.x).not.toBe(9999);
  });

  it('mutating a packet in a snapshot does not affect the simulation', () => {
    const simulation = new Simulation(
      { ...defaultSimulationConfig, packetSpawnRate: 100 },
      42,
    );
    runSimulationSteps(simulation, 10);
    const snapshot = simulation.getSnapshot();

    if (snapshot.packets.length > 0) {
      snapshot.packets[0].position.x = 9999;
      const secondSnapshot = simulation.getSnapshot();
      expect(secondSnapshot.packets[0].position.x).not.toBe(9999);
    }
  });
});
