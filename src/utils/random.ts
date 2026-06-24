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
  let internalState = seed >>> 0;
  return function (): number {
    internalState += 0x6d2b79f5;
    let hashValue = internalState;
    hashValue = Math.imul(hashValue ^ (hashValue >>> 15), hashValue | 1);
    hashValue ^= hashValue + Math.imul(hashValue ^ (hashValue >>> 7), hashValue | 61);
    return ((hashValue ^ (hashValue >>> 14)) >>> 0) / 4294967296;
  };
}
