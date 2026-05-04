import { BusKinds, MessageRegistry, MessageRegistryType, TypedMessage } from '../core/bus.js';

import { Middleware } from '../core/middleware.js';
import { createInMemoryLockAdapter } from '../adapters/in-memory-lock-adapter.js';
import { Envelope } from '../core/envelope.js';

export type LockAdapter = {
    acquire: (key: string, ttl: number) => Promise<boolean>;
    release: (key: string) => Promise<void>;
};

type BasicOptions = {
    ttl?: number;
    timeout?: number;
    tick?: number;
};

type Options<BusKind extends BusKinds, T extends MessageRegistryType<BusKind>> = BasicOptions & {
    adapter?: LockAdapter;
    getLockKey: (envelope: Envelope<TypedMessage<MessageRegistry<BusKind, T>>>) => Promise<string>;
    intents?: {
        [K in keyof T]?: BasicOptions & {
            getLockKey?: (envelope: NarrowedEnvelope<BusKind, T, K>) => Promise<string>;
        };
    };
};

type NarrowedEnvelope<BusKind extends BusKinds, T extends MessageRegistryType<BusKind>, K extends keyof T> = Envelope<
    TypedMessage<MessageRegistry<BusKind, Pick<T, K>>>
>;

export function createLockMiddleware<BusKind extends BusKinds, T extends MessageRegistryType<BusKind>>(
    options: Options<BusKind, T>,
): Middleware<BusKind, T> {
    const adapter = options.adapter ?? createInMemoryLockAdapter();
    return async (envelope, next) => {
        const type = envelope.message.__type as keyof T;
        const intent = options.intents?.[type];
        const ttl = intent?.ttl ?? options.ttl ?? 500;
        const tick = intent?.tick ?? options.tick ?? 100;
        const timeout = intent?.timeout ?? options.timeout ?? 5000;
        const getLockKey = intent?.getLockKey ?? options.getLockKey;
        const lockKey = await getLockKey(envelope);
        const deadline = Date.now() + timeout;

        while (!(await adapter.acquire(lockKey, ttl))) {
            if (Date.now() >= deadline) {
                throw new Error('Lock not acquired or timeout');
            }
            await new Promise((resolve) => setTimeout(resolve, tick));
        }

        try {
            await next();
        } finally {
            await adapter.release(lockKey);
        }
    };
}
