import { createMemoryCacheAdapter } from '../adapters/in-memory-cache-adapter.js';
import { QueryBus, QueryMessageRegistryType } from '../core/bus.js';
import { createEnvelope, HandledStamp, ReprocessedStamp, Stamp } from '../core/envelope.js';
import { Middleware } from '../core/middleware.js';

export type CacherAdapter = {
    get: (key: string) => Promise<unknown | null>;
    set: (key: string, value: unknown, ttl: number) => Promise<void>;
};

export type CacheableStamp = Stamp<{ ttl?: number; staleTtl?: number }, 'missive:cacheable'>;
export type FromCacheStamp = Stamp<{ age: number; stale: boolean }, 'missive:cache:hit'>;
export type RevalidatingStamp = Stamp<undefined, 'missive:cache:revalidating'>;

const hashKey = async (data: string): Promise<string> => {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
};

type BasicOptions = {
    cache?: 'all' | 'only-cacheable';
    defaultTtl?: number;
    defaultStaleTtl?: number;
    shortCircuit?: boolean;
};

type Options<Def extends QueryMessageRegistryType> = BasicOptions & {
    adapter: CacherAdapter;
    bus?: QueryBus<Def>;
    intents?: Partial<Record<keyof Def, BasicOptions>>;
    onRevalidationError?: (error: unknown) => void;
};

type CacheEntry = {
    timestamp: number;
    data: unknown;
};

export function createCacherMiddleware<T extends QueryMessageRegistryType>({
    adapter,
    intents,
    bus,
    cache = 'all',
    defaultTtl = 3600,
    defaultStaleTtl = 60,
    shortCircuit = true,
    onRevalidationError,
}: Partial<Options<T>> = {}): Middleware<'query', T> {
    if (!adapter) {
        adapter = createMemoryCacheAdapter();
    }
    const inProgressRevalidations = new Set<string>();
    const inProgressFills = new Map<string, Promise<void>>();

    return async (envelope, next) => {
        const type = envelope.message.__type as keyof T;
        const key = await hashKey(JSON.stringify(envelope.message));

        const now = Date.now() / 1000;
        const cachingOptions = intents?.[type] || {};
        const ttl = cachingOptions.defaultTtl ?? defaultTtl;
        const staleWhileRevalidateTtl = cachingOptions.defaultStaleTtl ?? defaultStaleTtl;
        let stale = false;
        const reprocessed = envelope.firstStamp<ReprocessedStamp>('missive:reprocessed');
        const revalidating = envelope.firstStamp<RevalidatingStamp>('missive:cache:revalidating');

        // Skip the cache when reprocessed, or when this pass is the SWR revalidation itself.
        // Both guards are kept on purpose: the bus marks a re-dispatched revalidation envelope as
        // `reprocessed`, while a directly re-entered envelope still carries the top-level
        // `revalidating` stamp — either one must prevent serving/looping on the cache.
        const cacheEntry = reprocessed || revalidating ? null : ((await adapter.get(key)) as CacheEntry | null);

        if (cacheEntry) {
            const age = now - cacheEntry.timestamp;
            stale = age > ttl;
            envelope.addStamp<HandledStamp<unknown>>('missive:handled', cacheEntry.data);
            envelope.addStamp<FromCacheStamp>('missive:cache:hit', { age, stale });
        }

        if (
            bus &&
            !reprocessed &&
            !revalidating &&
            stale &&
            staleWhileRevalidateTtl > 0 &&
            !inProgressRevalidations.has(key)
        ) {
            inProgressRevalidations.add(key);
            // remove cache stamps so the revalidation can re-enter the chain without short-circuiting
            const skipOnRevalidate = new Set(['missive:cache:hit', 'missive:handled', 'missive:identity']);
            const newEnvelope = createEnvelope(envelope.message);
            newEnvelope.addStamp<RevalidatingStamp>('missive:cache:revalidating');
            for (const stamp of envelope.stamps) {
                if (!skipOnRevalidate.has(stamp.type)) {
                    newEnvelope.addStamp(stamp.type, stamp.body);
                }
            }
            bus.dispatch(newEnvelope)
                .catch((error) => onRevalidationError?.(error))
                .finally(() => inProgressRevalidations.delete(key));
            return;
        }

        const breakChain = cachingOptions.shortCircuit ?? shortCircuit;
        if (cacheEntry && breakChain) {
            return;
        }

        // Coalesce concurrent cold fills for the same key: only one dispatch runs the handler,
        // the others wait for it and serve the freshly-cached value (avoids a cache stampede).
        const isColdFill = !cacheEntry && !reprocessed && !revalidating;
        if (isColdFill && inProgressFills.has(key)) {
            await inProgressFills.get(key);
            const filled = (await adapter.get(key)) as CacheEntry | null;
            if (filled) {
                const age = Date.now() / 1000 - filled.timestamp;
                envelope.addStamp<HandledStamp<unknown>>('missive:handled', filled.data);
                envelope.addStamp<FromCacheStamp>('missive:cache:hit', { age, stale: age > ttl });
                return;
            }
        }

        let releaseFill: (() => void) | undefined;
        if (isColdFill) {
            inProgressFills.set(key, new Promise<void>((resolve) => (releaseFill = resolve)));
        }
        try {
            await next();
            const cacheableStamp = envelope.firstStamp<CacheableStamp>('missive:cacheable');
            const caching = cachingOptions.cache ?? cache;
            // don't cache a failed pass: a handler that reports an error stamp produced no valid result
            const hasError = envelope.stamps.some((stamp) => stamp.type === 'error');
            if (!hasError && (caching === 'all' || (caching === 'only-cacheable' && cacheableStamp)) && ttl > 0) {
                const result = envelope.lastStamp<HandledStamp<unknown>>('missive:handled');
                const ttlInStore =
                    (cacheableStamp?.body?.ttl ?? ttl) + (cacheableStamp?.body?.staleTtl ?? staleWhileRevalidateTtl);
                await adapter.set(
                    key,
                    {
                        timestamp: now,
                        data: result?.body,
                    },
                    ttlInStore,
                );
            }
        } finally {
            if (isColdFill) {
                inProgressFills.delete(key);
                releaseFill?.();
            }
        }
    };
}
