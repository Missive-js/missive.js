import { describe, expect, it } from 'vitest';
import { createInMemoryLockAdapter } from '../../src/adapters/in-memory-lock-adapter';

describe('InMemoryLockAdapter', () => {
    const adapter = createInMemoryLockAdapter();
    it('should acquire a lock', async () => {
        const isAcquired = await adapter.acquire('key', 100, 'token');
        expect(isAcquired).toBe(true);

        await adapter.release('key', 'token');
    });
    it('should be able to acquire a lock after the lock has expired', async () => {
        const isAcquired = await adapter.acquire('test', 0, 'token-1');
        expect(isAcquired).toBe(true);

        const isAcquired2 = await adapter.acquire('test', 100, 'token-2');
        expect(isAcquired2).toBe(true);

        await adapter.release('test', 'token-2');
    });

    it('should not be able to acquire a lock if it is not released', async () => {
        const isAcquired = await adapter.acquire('another-key', 10000, 'token-1');
        expect(isAcquired).toBe(true);

        const isAcquired2 = await adapter.acquire('another-key', 10000, 'token-2');
        expect(isAcquired2).toBe(false);

        await adapter.release('another-key', 'token-1');
    });

    it('should be able to release a lock', async () => {
        await adapter.release('non-existing-key', 'token');
    });

    it('release with a stale token does not free a lock re-acquired by another owner', async () => {
        const fencing = createInMemoryLockAdapter();
        // A acquires with a short ttl
        expect(await fencing.acquire('fenced', 10, 'token-A')).toBe(true);
        // A's lock expires
        await new Promise((r) => setTimeout(r, 25));
        // B takes over the now-expired key
        expect(await fencing.acquire('fenced', 1000, 'token-B')).toBe(true);
        // A releases late — it no longer owns the lock, so this must be a no-op
        await fencing.release('fenced', 'token-A');
        // C must still be blocked because B holds the lock
        expect(await fencing.acquire('fenced', 1000, 'token-C')).toBe(false);
    });
});
