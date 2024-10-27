import { QueryMessageRegistryType } from '../core/bus';
import { HandledStamp, Stamp } from '../core/envelope';
import { Middleware } from '../core/middleware';

export type CacherAdapter = {
    get: (key: string) => Promise<unknown | null>;
    set: (key: string, value: unknown, ttl: number) => Promise<void>;
};

export type CacheableStamp = Stamp<{ ttl?: number }, 'missive:cacheable'>;
export type FromCacheStamp = Stamp<undefined, 'missive:cache:hit'>;

const hashKey = async (data: string): Promise<string> => {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
};

type Options = {
    adapter: CacherAdapter;
    cache?: 'all' | 'only-cacheable';
    defaultTtl?: number;
};

export function createCacherMiddleware<T extends QueryMessageRegistryType>({
    adapter,
    cache = 'all',
    defaultTtl = 3600,
}: Partial<Options> = {}): Middleware<'query', T> {
    if (!adapter) {
        const createMemoryCacheAdapter = (): CacherAdapter => {
            const memory = new Map<string, { value: unknown; expiresAt: number }>();
            return {
                get: async (key) => {
                    const entry = memory.get(key);
                    if (entry && Date.now() < entry.expiresAt) {
                        return entry.value;
                    }
                    memory.delete(key);
                    return null;
                },
                set: async (key: string, value, ttl) => {
                    const expiresAt = Date.now() + ttl * 1000;
                    memory.set(key, { value, expiresAt });
                },
            };
        };
        adapter = createMemoryCacheAdapter();
    }

    return async (envelope, next) => {
        const key = await hashKey(JSON.stringify(envelope.message));
        const cached = await adapter.get(key);
        if (cached) {
            envelope.addStamp<HandledStamp<unknown>>('missive:handled', cached);
            envelope.addStamp<FromCacheStamp>('missive:cache:hit');
            return;
        }

        await next();
        const result = envelope.lastStamp<HandledStamp<unknown>>('missive:handled');
        const cacheableStamp = envelope.firstStamp<CacheableStamp>('missive:cacheable');

        if (cacheableStamp || cache === 'all' || (cache === 'only-cacheable' && cacheableStamp)) {
            await adapter.set(key, result?.body, cacheableStamp?.body?.ttl || defaultTtl);
        }
    };
}
