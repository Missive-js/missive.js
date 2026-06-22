import { LockAdapter } from '../middlewares/lock-middleware.js';

type LockerInfo = {
    expiresAt: number;
    token: string;
};

export function createInMemoryLockAdapter(): LockAdapter {
    const store: Map<string, LockerInfo> = new Map();

    return {
        acquire: async (key, ttl, token) => {
            const existing = store.get(key);
            if (existing && existing.expiresAt > Date.now()) {
                return false;
            }
            store.set(key, { expiresAt: Date.now() + ttl, token });
            return true;
        },
        release: async (key, token) => {
            const existing = store.get(key);
            // only the current holder (matching fencing token) may release the lock
            if (existing && existing.token === token) {
                store.delete(key);
            }
        },
    };
}
