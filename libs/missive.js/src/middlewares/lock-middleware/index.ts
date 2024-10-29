import { BusKinds, MessageRegistryType } from '../../core/bus';

import { Middleware } from '../../core/middleware';
import { createInMemoryLockAdapter } from './in-memory-lock';
import { LockAdapter } from './types';

type Options<Def> = {
    lockAdapter?: LockAdapter;
    tickInMs?: number;
    timeoutToAcquireLock?: number;

    defaultTtl?: number;
    mappingToTtl: Record<keyof Def, number>;
};

type Params<BusKind extends BusKinds, T extends MessageRegistryType<BusKind>> = {
    getLockKey: (envelope: LockMiddlewareMessage<BusKind, T>) => string;
};

export type LockMiddlewareMessage<BusKind extends BusKinds, T extends MessageRegistryType<BusKind>> = Parameters<
    Middleware<BusKind, T>
>[0];

export function createLockMiddleware<BusKind extends BusKinds, T extends MessageRegistryType<BusKind>>(
    { getLockKey }: Params<BusKind, T>,
    {
        lockAdapter,
        tickInMs: tick = 1000,
        timeoutToAcquireLock: timeoutAcquireLock,
        defaultTtl = 500,
        mappingToTtl,
    }: Partial<Options<T>> = {},
): Middleware<BusKind, T> {
    const adapter = lockAdapter ?? createInMemoryLockAdapter();

    return async (envelope, next) => {
        async function doUnderLock(timeout: number) {
            const type = envelope.message.__type;
            const ttl = mappingToTtl?.[type] ?? defaultTtl;
            const lockKey = getLockKey(envelope);
            const isAcquired = await adapter.acquire(lockKey, ttl);
            if (isAcquired) {
                try {
                    await next();
                    await adapter.release(lockKey);
                    return;
                } catch (error) {
                    await adapter.release(lockKey);
                    throw error;
                }
            } else {
                if (Date.now() < timeout) {
                    await new Promise((resolve) => setTimeout(resolve, tick));
                    return doUnderLock(timeout);
                }

                throw new Error('Lock not acquired or timeout');
            }
        }

        await doUnderLock(Date.now() + (timeoutAcquireLock ?? 0));
    };
}
