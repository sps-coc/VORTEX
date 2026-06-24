/**
 * Creates a deterministic pseudo-random number generator (mulberry32 algorithm).
 *
 * Returns a function that, when called repeatedly, produces a uniform stream of
 * numbers in [0, 1). The same seed always produces the same sequence, making
 * simulations reproducible and tests deterministic.
 *
 * @param seed - Any 32-bit integer seed value.
 */
export function createRng(seed: number): () => number {
  let s = seed >>> 0;
  return function (): number {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
