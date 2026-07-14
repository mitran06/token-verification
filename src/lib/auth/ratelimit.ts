// In-memory login limiter. Single app instance (medium scale) → a Map is enough;
// state resets on restart, which is fine for a brute-force speed bump. (For a
// multi-replica deploy this would need a shared store — noted for scale.)

type Bucket = { fails: number; firstFailAt: number; lockedUntil: number };
type Opts = { maxFails: number; windowMs: number; lockMs: number; maxKeys?: number };

function createLimiter({ maxFails, windowMs, lockMs, maxKeys = 10_000 }: Opts) {
  const store = new Map<string, Bucket>();
  return {
    lockRemainingMs(key: string, now = Date.now()): number {
      const b = store.get(key);
      if (!b) return 0;
      return b.lockedUntil > now ? b.lockedUntil - now : 0;
    },
    recordFailure(key: string, now = Date.now()): void {
      // Evict the oldest entry under a key-flood rather than wiping everything
      // (which would clear all active lockouts).
      if (store.size > maxKeys) {
        const oldest = store.keys().next().value;
        if (oldest !== undefined) store.delete(oldest);
      }
      const b = store.get(key);
      if (!b || now - b.firstFailAt > windowMs) {
        store.set(key, { fails: 1, firstFailAt: now, lockedUntil: 0 });
        return;
      }
      b.fails += 1;
      if (b.fails >= maxFails) {
        b.lockedUntil = now + lockMs;
        b.fails = 0;
        b.firstFailAt = now;
      }
    },
    recordSuccess(key: string): void {
      store.delete(key);
    },
    reset(): void {
      store.clear();
    },
  };
}

// Per-identity limiter (login by username+IP, counter password by IP).
const primary = createLimiter({ maxFails: 5, windowMs: 15 * 60_000, lockMs: 15 * 60_000 });
export const lockRemainingMs = primary.lockRemainingMs;
export const recordFailure = primary.recordFailure;
export const recordSuccess = primary.recordSuccess;
export const _resetRateLimit = primary.reset;

// Global backstop for the shared counter password (across ALL client IPs), so a
// distributed/botnet brute force can't parallelize around the per-IP limit.
export const counterPwGlobal = createLimiter({
  maxFails: 100,
  windowMs: 15 * 60_000,
  lockMs: 5 * 60_000,
});
