import { describe, expect, it } from 'vitest';
import { Simulation } from '../simulation/Simulation';
import { defaultSimulationConfig } from '../config/defaultSimulationConfig';

// Helper: step a simulation N times at a fixed dt
function step(sim: Simulation, n: number, dt = 0.1): void {
  for (let i = 0; i < n; i++) sim.update(dt);
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
    const sim = new Simulation(
      { ...defaultSimulationConfig, massFunctionMode: 'constant' as const },
      42,
    );
    step(sim, 100);
    const snap = sim.getSnapshot();
    expect(snap.blackHole.mass).toBeCloseTo(defaultSimulationConfig.initialMass);
  });

  it('apparent horizon radius equals 2 × mass', () => {
    const sim = new Simulation(
      { ...defaultSimulationConfig, massFunctionMode: 'constant' as const },
      42,
    );
    step(sim, 50);
    const { blackHole } = sim.getSnapshot();
    expect(blackHole.apparentHorizonRadius).toBeCloseTo(2 * blackHole.mass);
  });
});

describe('Simulation — linear mode', () => {
  it('mass tracks M0 + rate × advancedTime', () => {
    const rate = 0.1;
    const M0 = 1;
    const sim = new Simulation(
      {
        ...defaultSimulationConfig,
        massFunctionMode: 'linear' as const,
        initialMass: M0,
        linearGrowthRate: rate,
        timeScale: 1,
      },
      42,
    );
    const dt = 0.05;
    const steps = 80;
    step(sim, steps, dt);
    const snap = sim.getSnapshot();
    const expectedMass = M0 + rate * snap.advancedTime;
    expect(snap.blackHole.mass).toBeCloseTo(expectedMass, 6);
  });

  it('apparent horizon radius equals 2 × mass throughout', () => {
    const sim = new Simulation(
      { ...defaultSimulationConfig, massFunctionMode: 'linear' as const },
      42,
    );
    for (let i = 0; i < 100; i++) {
      sim.update(0.05);
      const { blackHole } = sim.getSnapshot();
      expect(blackHole.apparentHorizonRadius).toBeCloseTo(2 * blackHole.mass, 10);
    }
  });
});

describe('Simulation — smooth-pulse mode', () => {
  it('mass is monotonically non-decreasing (energy condition)', () => {
    const sim = new Simulation(
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
    let prevMass = -Infinity;
    for (let i = 0; i < 200; i++) {
      sim.update(0.1);
      const { blackHole } = sim.getSnapshot();
      expect(blackHole.mass).toBeGreaterThanOrEqual(prevMass - 1e-10);
      prevMass = blackHole.mass;
    }
  });

  it('asymptotes to M0 + ΔM well after the pulse', () => {
    const M0 = 1;
    const dM = 2;
    const sim = new Simulation(
      {
        ...defaultSimulationConfig,
        massFunctionMode: 'smooth-pulse' as const,
        initialMass: M0,
        pulseDeltaMass: dM,
        pulseCenter: 2,
        pulseWidth: 0.5,
        timeScale: 1,
        packetSpawnRate: 0, // no packets needed for this physics test
      },
      42,
    );
    step(sim, 200, 0.1); // reach v = 20, well past the pulse
    const { blackHole } = sim.getSnapshot();
    expect(blackHole.mass).toBeCloseTo(M0 + dM, 3);
  });
});

describe('Simulation — packet-driven mode', () => {
  it('mass increases as packets are absorbed', () => {
    const sim = new Simulation(fastAbsorbConfig, 42);
    step(sim, 20, 0.05);
    const snap = sim.getSnapshot();
    expect(snap.absorbedPacketCount).toBeGreaterThan(0);
    expect(snap.blackHole.mass).toBeGreaterThan(fastAbsorbConfig.initialMass);
  });

  it('mass equals initialMass + sum of absorbed energies', () => {
    const sim = new Simulation(fastAbsorbConfig, 42);
    step(sim, 20, 0.05);
    const snap = sim.getSnapshot();
    const expectedMass =
      fastAbsorbConfig.initialMass + snap.absorbedPacketCount * fastAbsorbConfig.packetEnergy;
    expect(snap.blackHole.mass).toBeCloseTo(expectedMass, 8);
  });

  it('mass does not grow before any packets are absorbed', () => {
    // Use slow packets so no absorption happens in 1 step
    const sim = new Simulation(
      {
        ...fastAbsorbConfig,
        packetSpeed: 0.001, // extremely slow — nothing absorbed in 1 step
        spawnRadius: 100,
      },
      42,
    );
    sim.update(0.001);
    const snap = sim.getSnapshot();
    expect(snap.blackHole.mass).toBeCloseTo(fastAbsorbConfig.initialMass);
  });
});

describe('Simulation — pause / resume', () => {
  it('pause freezes advancedTime and mass', () => {
    const sim = new Simulation(
      { ...defaultSimulationConfig, massFunctionMode: 'linear' as const },
      42,
    );
    step(sim, 10);
    sim.pause();
    const snapBefore = sim.getSnapshot();
    step(sim, 10); // these updates should be no-ops
    const snapAfter = sim.getSnapshot();
    expect(snapAfter.advancedTime).toBe(snapBefore.advancedTime);
    expect(snapAfter.blackHole.mass).toBe(snapBefore.blackHole.mass);
    expect(snapAfter.packets.length).toBe(snapBefore.packets.length);
  });

  it('isPaused() reflects the paused state', () => {
    const sim = new Simulation(defaultSimulationConfig, 42);
    expect(sim.isPaused()).toBe(false);
    sim.pause();
    expect(sim.isPaused()).toBe(true);
    sim.resume();
    expect(sim.isPaused()).toBe(false);
  });

  it('resume allows updates to proceed again', () => {
    const sim = new Simulation(
      { ...defaultSimulationConfig, massFunctionMode: 'linear' as const, linearGrowthRate: 0.1 },
      42,
    );
    step(sim, 5);
    sim.pause();
    const massBefore = sim.getSnapshot().blackHole.mass;
    sim.resume();
    step(sim, 5);
    expect(sim.getSnapshot().blackHole.mass).toBeGreaterThan(massBefore);
  });
});

describe('Simulation — reset', () => {
  it('restores advancedTime to 0', () => {
    const sim = new Simulation(defaultSimulationConfig, 42);
    step(sim, 50);
    sim.reset();
    expect(sim.getSnapshot().advancedTime).toBe(0);
  });

  it('restores mass to initialMass', () => {
    const sim = new Simulation(defaultSimulationConfig, 42);
    step(sim, 50);
    sim.reset();
    expect(sim.getSnapshot().blackHole.mass).toBe(defaultSimulationConfig.initialMass);
  });

  it('clears all packets and counters', () => {
    const sim = new Simulation(defaultSimulationConfig, 42);
    step(sim, 50);
    sim.reset();
    const snap = sim.getSnapshot();
    expect(snap.packets.length).toBe(0);
    expect(snap.absorbedPacketCount).toBe(0);
  });

  it('produces the same results as a fresh simulation after reset (same seed)', () => {
    const seed = 99;
    const sim = new Simulation(defaultSimulationConfig, seed);
    step(sim, 50);
    sim.reset();
    const fresh = new Simulation(defaultSimulationConfig, seed);

    // Run both for 30 steps and compare
    step(sim, 30);
    step(fresh, 30);

    const snap1 = sim.getSnapshot();
    const snap2 = fresh.getSnapshot();
    expect(snap1.advancedTime).toBe(snap2.advancedTime);
    expect(snap1.blackHole.mass).toBe(snap2.blackHole.mass);
    expect(snap1.packets.length).toBe(snap2.packets.length);
  });
});

describe('Simulation — setConfig', () => {
  it('switching from constant to linear mode causes mass to grow', () => {
    const sim = new Simulation(
      { ...defaultSimulationConfig, massFunctionMode: 'constant' as const },
      42,
    );
    step(sim, 10);
    const massBefore = sim.getSnapshot().blackHole.mass;

    sim.setConfig({ massFunctionMode: 'linear', linearGrowthRate: 0.5 });
    step(sim, 10);
    expect(sim.getSnapshot().blackHole.mass).toBeGreaterThan(massBefore);
  });

  it('setConfig does not reset advancedTime or packets', () => {
    const sim = new Simulation(defaultSimulationConfig, 42);
    step(sim, 30);
    const timeBefore = sim.getSnapshot().advancedTime;
    sim.setConfig({ timeScale: 2 });
    // advancedTime is unchanged immediately after setConfig
    expect(sim.getSnapshot().advancedTime).toBe(timeBefore);
  });
});

describe('Simulation — maxPackets cap', () => {
  it('never exceeds maxPackets active packets', () => {
    const cap = 10;
    const sim = new Simulation(
      {
        ...noAbsorbConfig,
        maxPackets: cap,
        packetSpawnRate: 100, // spawn as fast as possible
      },
      42,
    );
    step(sim, 50);
    expect(sim.getSnapshot().packets.length).toBeLessThanOrEqual(cap);
  });
});

describe('Simulation — deterministic / seeded RNG', () => {
  it('two simulations with the same seed produce identical snapshots', () => {
    const seed = 7;
    const sim1 = new Simulation(defaultSimulationConfig, seed);
    const sim2 = new Simulation(defaultSimulationConfig, seed);
    step(sim1, 60);
    step(sim2, 60);

    const snap1 = sim1.getSnapshot();
    const snap2 = sim2.getSnapshot();

    expect(snap1.advancedTime).toBe(snap2.advancedTime);
    expect(snap1.packets.length).toBe(snap2.packets.length);
    expect(snap1.blackHole.mass).toBe(snap2.blackHole.mass);

    for (let i = 0; i < snap1.packets.length; i++) {
      expect(snap1.packets[i].position.x).toBe(snap2.packets[i].position.x);
      expect(snap1.packets[i].position.y).toBe(snap2.packets[i].position.y);
    }
  });

  it('two simulations with different seeds produce different packet distributions', () => {
    const sim1 = new Simulation(defaultSimulationConfig, 1);
    const sim2 = new Simulation(defaultSimulationConfig, 2);
    step(sim1, 30);
    step(sim2, 30);

    const p1 = sim1.getSnapshot().packets;
    const p2 = sim2.getSnapshot().packets;

    // Highly unlikely that first packet positions match with different seeds
    if (p1.length > 0 && p2.length > 0) {
      const positionsMatch =
        p1[0].position.x === p2[0].position.x && p1[0].position.y === p2[0].position.y;
      expect(positionsMatch).toBe(false);
    }
  });
});

describe('Simulation — snapshot isolation', () => {
  it('mutating a snapshot does not affect subsequent snapshots', () => {
    const sim = new Simulation(defaultSimulationConfig, 42);
    sim.update(0.1);
    const snap = sim.getSnapshot();

    // Mutate the snapshot
    snap.blackHole.mass = 9999;
    snap.config.initialMass = 9999;
    snap.blackHole.position.x = 9999;

    // Simulation should be unaffected
    const snap2 = sim.getSnapshot();
    expect(snap2.blackHole.mass).not.toBe(9999);
    expect(snap2.config.initialMass).not.toBe(9999);
    expect(snap2.blackHole.position.x).not.toBe(9999);
  });

  it('mutating a packet in a snapshot does not affect the simulation', () => {
    const sim = new Simulation(
      { ...defaultSimulationConfig, packetSpawnRate: 100 },
      42,
    );
    step(sim, 10);
    const snap = sim.getSnapshot();

    if (snap.packets.length > 0) {
      snap.packets[0].position.x = 9999;
      const snap2 = sim.getSnapshot();
      expect(snap2.packets[0].position.x).not.toBe(9999);
    }
  });
});
