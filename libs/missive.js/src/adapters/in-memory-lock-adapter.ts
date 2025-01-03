import { LockAdapter } from '../middlewares/lock-middleware.js';

type LockerInfo = {
    expiresAt: number;
};

export function createInMemoryLockAdapter(): LockAdapter {
    const store: Map<string, LockerInfo> = new Map();

    return {
        acquire: async (key, ttl) => {
            if (store.has(key)) {
                if (store.get(key)!.expiresAt > Date.now()) {
                    return false;
                }
            }
            const now = Date.now();
            const expiresAt = now + ttl;
            store.set(key, { expiresAt });
            return true;
        },
        release: async (key) => {
            store.delete(key);
        },
    };
}
