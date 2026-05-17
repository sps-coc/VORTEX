import { describe, expect, it } from 'vitest';
import type { SimulationConfig, SimulationSnapshot } from '../simulation'

describe('core simulation types', () => {
	it('can represent a basic simulation snapshot', () => {
		const config: SimulationConfig = {
			initialMass: 1,
			massFunctionMode: 'constant',
			linearGrowthRate: 0,
			pulseDeltaMass: 0,
			pulseCenter: 0,
			pulseWidth: 1,
			packetEnergy: 0.01,
			packetSpawnRate: 5,
			packetSpeed: 1,
			spawnRadius: 10,
			timeScale: 1,
			maxPackets: 100,
		};

		const snapshot: SimulationSnapshot = {
			advancedTime: 0,
			blackHole: {
				mass: 1,
				apparentHorizonRadius: 2,
				position: { x: 0, y: 0 },
			},
			packets: [],
			absorbedPacketCount: 0,
			config,
		};

		expect(snapshot.blackHole.apparentHorizonRadius).toBe(2);
		expect(snapshot.config.massFunctionMode).toBe('constant');
	});
});
