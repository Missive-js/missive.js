import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCacherMiddleware, CacherAdapter } from '../src/middlewares/cacher-middleware';
import { createEnvelope, Envelope } from '../src/core/envelope';
import { QueryBus, TypedMessage } from '../src/core/bus';

describe('createCacherMiddleware', () => {
    let adapter: CacherAdapter;
    let middleware: ReturnType<typeof createCacherMiddleware>;
    let envelope: Envelope<TypedMessage<object>>;
    let next: ReturnType<typeof vi.fn<() => Promise<void>>>;

    beforeEach(() => {
        adapter = {
            get: vi.fn(),
            set: vi.fn(),
        };
        envelope = {
            __type: 'test-message',
            message: { query: 'test' },
            stamps: [],
            addStamp: vi.fn(),
            firstStamp: vi.fn(),
            lastStamp: vi.fn(),
        } as unknown as Envelope<TypedMessage<object>>;
        next = vi.fn<() => Promise<void>>();
    });

    it('should use cache when cache is hit - shortcircuit (default)', async () => {
        (adapter.get as ReturnType<typeof vi.fn>).mockResolvedValue({
            timestamp: Date.now() / 1000,
            data: { data: 'cached' },
        });

        middleware = createCacherMiddleware({ adapter });

        await middleware(envelope, next);

        expect(adapter.get).toHaveBeenCalled();
        expect(envelope.addStamp).toHaveBeenCalledWith('missive:handled', { data: 'cached' });
        expect(envelope.addStamp).toHaveBeenCalledWith('missive:cache:hit', {
            age: expect.any(Number),
            stale: expect.any(Boolean),
        });
        expect(next).not.toHaveBeenCalled();
    });

    it('should use cache when cache is hit - NO shortcircuit', async () => {
        (adapter.get as ReturnType<typeof vi.fn>).mockResolvedValue({
            timestamp: Date.now() / 1000,
            data: { data: 'cached' },
        });

        middleware = createCacherMiddleware({ adapter, shortCircuit: false });

        await middleware(envelope, next);

        expect(adapter.get).toHaveBeenCalled();
        expect(envelope.addStamp).toHaveBeenCalledWith('missive:handled', { data: 'cached' });
        expect(envelope.addStamp).toHaveBeenCalledWith('missive:cache:hit', {
            age: expect.any(Number),
            stale: expect.any(Boolean),
        });
        expect(next).toHaveBeenCalled();
    });

    it('should call next and cache result when cache is missed', async () => {
        (adapter.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        (envelope.lastStamp as ReturnType<typeof vi.fn>).mockReturnValue({ body: { data: 'result' } });

        middleware = createCacherMiddleware({ adapter });

        await middleware(envelope, next);

        expect(adapter.get).toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
        expect(adapter.set).toHaveBeenCalledWith(
            expect.any(String),
            { data: { data: 'result' }, timestamp: expect.any(Number) },
            3660,
        );
    });

    it('should respect cacheable stamp ttl', async () => {
        (adapter.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        (envelope.lastStamp as ReturnType<typeof vi.fn>).mockReturnValue({ body: { data: 'result' } });
        (envelope.firstStamp as ReturnType<typeof vi.fn>).mockReturnValueOnce(null); // reprocessed call
        (envelope.firstStamp as ReturnType<typeof vi.fn>).mockReturnValueOnce(null); // revalidating call
        (envelope.firstStamp as ReturnType<typeof vi.fn>).mockReturnValueOnce({ body: { ttl: 100, staleTtl: 75 } });

        middleware = createCacherMiddleware({ adapter });

        await middleware(envelope, next);

        expect(adapter.get).toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
        expect(adapter.set).toHaveBeenCalledWith(
            expect.any(String),
            { data: { data: 'result' }, timestamp: expect.any(Number) },
            175,
        );
    });

    it('should use default ttl when cacheable stamp is not present', async () => {
        (adapter.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        (envelope.lastStamp as ReturnType<typeof vi.fn>).mockReturnValue({ body: { data: 'result' } });

        middleware = createCacherMiddleware({ adapter, defaultTtl: 500 });

        await middleware(envelope, next);

        expect(adapter.get).toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
        expect(adapter.set).toHaveBeenCalledWith(
            expect.any(String),
            { data: { data: 'result' }, timestamp: expect.any(Number) },
            560,
        );
    });

    it('should cache only cacheable messages when cache is set to only-cacheable', async () => {
        (adapter.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        (envelope.lastStamp as ReturnType<typeof vi.fn>).mockReturnValue({ body: { data: 'result' } });
        (envelope.firstStamp as ReturnType<typeof vi.fn>).mockReturnValueOnce(null); // reprocessed call
        (envelope.firstStamp as ReturnType<typeof vi.fn>).mockReturnValueOnce(null); // revalidating call
        middleware = createCacherMiddleware({ adapter, cache: 'only-cacheable' });

        await middleware(envelope, next);

        expect(adapter.get).toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
        expect(adapter.set).not.toHaveBeenCalled();

        (envelope.firstStamp as ReturnType<typeof vi.fn>).mockReturnValueOnce(null); // reprocessed call
        (envelope.firstStamp as ReturnType<typeof vi.fn>).mockReturnValueOnce(null); // revalidating call
        (envelope.firstStamp as ReturnType<typeof vi.fn>).mockReturnValueOnce({ body: { ttl: 100 } });
        await middleware(envelope, next);

        expect(adapter.set).toHaveBeenCalledWith(
            expect.any(String),
            { data: { data: 'result' }, timestamp: expect.any(Number) },
            160,
        );
    });

    it('should revalidate cache when stale and bus is provided', async () => {
        const bus = {
            dispatch: vi.fn().mockResolvedValue(undefined),
            //eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as unknown as QueryBus<any>;
        (adapter.get as ReturnType<typeof vi.fn>).mockResolvedValue({
            timestamp: Date.now() / 1000 - 4000,
            data: { data: 'stale' },
        });
        (envelope.lastStamp as ReturnType<typeof vi.fn>).mockReturnValue({ body: { data: 'result' } });

        middleware = createCacherMiddleware({ adapter, bus });

        await middleware(envelope, next);

        expect(adapter.get).toHaveBeenCalled();
        expect(envelope.addStamp).toHaveBeenCalledWith('missive:handled', { data: 'stale' });
        expect(envelope.addStamp).toHaveBeenCalledWith('missive:cache:hit', { age: expect.any(Number), stale: true });
        expect(bus.dispatch).toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    it('should not revalidate cache when stale and bus is not provided', async () => {
        (adapter.get as ReturnType<typeof vi.fn>).mockResolvedValue({
            timestamp: Date.now() / 1000 - 4000,
            data: { data: 'stale' },
        });
        (envelope.lastStamp as ReturnType<typeof vi.fn>).mockReturnValue({ body: { data: 'result' } });

        middleware = createCacherMiddleware({ adapter });

        await middleware(envelope, next);

        expect(adapter.get).toHaveBeenCalled();
        expect(envelope.addStamp).toHaveBeenCalledWith('missive:handled', { data: 'stale' });
        expect(envelope.addStamp).toHaveBeenCalledWith('missive:cache:hit', { age: expect.any(Number), stale: true });
        expect(next).not.toHaveBeenCalled();
    });

    it('should handle cache revalidation errors gracefully', async () => {
        const bus = {
            dispatch: vi.fn().mockRejectedValue(new Error('Revalidation error')),
            //eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as unknown as QueryBus<any>;
        (adapter.get as ReturnType<typeof vi.fn>).mockResolvedValue({
            timestamp: Date.now() / 1000 - 4000,
            data: { data: 'stale' },
        });
        (envelope.lastStamp as ReturnType<typeof vi.fn>).mockReturnValue({ body: { data: 'result' } });

        middleware = createCacherMiddleware({ adapter, bus });

        await middleware(envelope, next);

        expect(adapter.get).toHaveBeenCalled();
        expect(envelope.addStamp).toHaveBeenCalledWith('missive:handled', { data: 'stale' });
        expect(envelope.addStamp).toHaveBeenCalledWith('missive:cache:hit', { age: expect.any(Number), stale: true });
        expect(bus.dispatch).toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    it('should not cache messages when ttl is zero', async () => {
        (adapter.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        (envelope.lastStamp as ReturnType<typeof vi.fn>).mockReturnValue({ body: { data: 'result' } });

        middleware = createCacherMiddleware({ adapter, defaultTtl: 0 });

        await middleware(envelope, next);

        expect(adapter.get).toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
        expect(adapter.set).not.toHaveBeenCalled();
    });

    it('should not use cache when message is reprocessed', async () => {
        (adapter.get as ReturnType<typeof vi.fn>).mockResolvedValue({
            timestamp: Date.now() / 1000,
            data: { data: 'cached' },
        });
        (envelope.firstStamp as ReturnType<typeof vi.fn>).mockReturnValue({ type: 'missive:reprocessed' });

        middleware = createCacherMiddleware({ adapter });

        await middleware(envelope, next);

        expect(adapter.get).not.toHaveBeenCalled();
        expect(envelope.addStamp).not.toHaveBeenCalledWith('missive:handled', { data: 'cached' });
        expect(envelope.addStamp).not.toHaveBeenCalledWith('missive:cache:hit', {
            age: expect.any(Number),
            stale: expect.any(Boolean),
        });
        expect(next).toHaveBeenCalled();
    });

    it('should not revalidate cache when message is reprocessed', async () => {
        const bus = {
            dispatch: vi.fn().mockResolvedValue(undefined),
            //eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as unknown as QueryBus<any>;
        (adapter.get as ReturnType<typeof vi.fn>).mockResolvedValue({
            timestamp: Date.now() / 1000 - 4000,
            data: { data: 'stale' },
        });
        (envelope.firstStamp as ReturnType<typeof vi.fn>).mockReturnValue({ type: 'missive:reprocessed' });

        middleware = createCacherMiddleware({ adapter, bus });

        await middleware(envelope, next);

        expect(adapter.get).not.toHaveBeenCalled();
        expect(envelope.addStamp).not.toHaveBeenCalledWith('missive:handled', { data: 'stale' });
        expect(envelope.addStamp).not.toHaveBeenCalledWith('missive:cache:hit', {
            age: expect.any(Number),
            stale: true,
        });
        expect(bus.dispatch).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
    });
});

describe('createCacherMiddleware - integration with real envelopes', () => {
    type Stored = { timestamp: number; data: unknown };
    let store: Map<string, Stored>;
    let adapter: CacherAdapter;

    const makeMessage = () => ({ __type: 'test-message', query: 'test' }) as TypedMessage<{ query: string }>;

    beforeEach(() => {
        store = new Map();
        adapter = {
            get: vi.fn(async (key: string) => store.get(key) ?? null),
            set: vi.fn(async (key: string, value: unknown) => {
                store.set(key, value as Stored);
            }),
        };
    });

    it('SWR actually refreshes the cache on the recursive dispatch', async () => {
        const handler = vi.fn(async (envelope: Envelope<TypedMessage<{ query: string }>>) => {
            envelope.addStamp('missive:handled', { data: 'fresh' });
        });

        // bus.dispatch re-enters the middleware with the recursive envelope
        const dispatch = vi.fn(async (env: Envelope<TypedMessage<{ query: string }>>) => {
            await middleware(env, () => handler(env));
            return env;
        });
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bus = { dispatch } as unknown as QueryBus<any>;

        const middleware = createCacherMiddleware({ adapter, bus, defaultTtl: 100, defaultStaleTtl: 60 });

        // seed the store with a stale entry (older than ttl)
        const message = makeMessage();
        const seedEnvelope = createEnvelope(message);
        await middleware(seedEnvelope, async () => {
            seedEnvelope.addStamp('missive:handled', { data: 'old' });
        });
        // force the entry to be stale
        const [key] = [...store.keys()];
        store.set(key, { timestamp: Date.now() / 1000 - 200, data: { data: 'old' } });

        // a stale read should serve the stale entry AND trigger revalidation
        const envelope = createEnvelope(message);
        await middleware(envelope, async () => {
            throw new Error('next should not run on a cache hit');
        });

        const hit = envelope.firstStamp('missive:cache:hit');
        expect(hit).toBeDefined();
        expect(hit?.body).toMatchObject({ stale: true });
        expect(envelope.firstStamp('missive:handled')?.body).toEqual({ data: 'old' });

        await vi.waitFor(() => {
            expect(handler).toHaveBeenCalledTimes(1);
            expect(store.get(key)?.data).toEqual({ data: 'fresh' });
        });
        expect(dispatch).toHaveBeenCalledTimes(1);
        const refreshed = store.get(key)!;
        expect(Date.now() / 1000 - refreshed.timestamp).toBeLessThan(1);
    });

    it('SWR does not loop: revalidation pass bypasses cache and SWR', async () => {
        const handler = vi.fn(async (envelope: Envelope<TypedMessage<{ query: string }>>) => {
            envelope.addStamp('missive:handled', { data: 'fresh' });
        });
        const dispatch = vi.fn(async (env: Envelope<TypedMessage<{ query: string }>>) => {
            await middleware(env, () => handler(env));
            return env;
        });
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bus = { dispatch } as unknown as QueryBus<any>;
        const middleware = createCacherMiddleware({ adapter, bus, defaultTtl: 100, defaultStaleTtl: 60 });

        const message = makeMessage();
        // seed
        await middleware(createEnvelope(message), async () => {
            // simulate the handler producing the initial value
        });
        const [key] = [...store.keys()];
        store.set(key, { timestamp: Date.now() / 1000 - 200, data: { data: 'old' } });

        await middleware(createEnvelope(message), async () => {
            throw new Error('next should not run on a cache hit');
        });
        await vi.waitFor(() => {
            expect(dispatch).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledTimes(1);
        });
    });

    it('strips cache stamps from the recursive envelope and preserves the rest', async () => {
        let captured: Envelope<TypedMessage<{ query: string }>> | undefined;
        const dispatch = vi.fn(async (env: Envelope<TypedMessage<{ query: string }>>) => {
            captured = env;
            return env;
        });
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bus = { dispatch } as unknown as QueryBus<any>;
        const middleware = createCacherMiddleware({ adapter, bus, defaultTtl: 100, defaultStaleTtl: 60 });

        const key = await (async () => {
            const seed = createEnvelope(makeMessage());
            await middleware(seed, async () => {});
            return [...store.keys()][0];
        })();
        store.set(key, { timestamp: Date.now() / 1000 - 200, data: { data: 'old' } });

        const envelope = createEnvelope(makeMessage());
        envelope.addStamp('missive:identity', { id: 'should-be-stripped' });
        envelope.addStamp('custom:trace', { id: 'should-be-kept' });

        await middleware(envelope, async () => {});
        await vi.waitFor(() => {
            expect(captured).toBeDefined();
        });

        const types = captured!.stamps.map((s: { type: string }) => s.type);
        expect(types).toContain('missive:cache:revalidating');
        expect(types).toContain('custom:trace');
        expect(types).not.toContain('missive:identity');
        expect(types).not.toContain('missive:cache:hit');
        expect(types).not.toContain('missive:handled');
    });

    it('dedups concurrent stale lookups: dispatches revalidation only once', async () => {
        let resolveHandler: (() => void) | undefined;
        const handlerStarted = new Promise<void>((r) => (resolveHandler = r));
        const handler = vi.fn(async (envelope: Envelope<TypedMessage<{ query: string }>>) => {
            resolveHandler?.();
            await new Promise((r) => setTimeout(r, 20));
            envelope.addStamp('missive:handled', { data: 'fresh' });
        });
        const dispatch = vi.fn(async (env: Envelope<TypedMessage<{ query: string }>>) => {
            await middleware(env, () => handler(env));
            return env;
        });
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bus = { dispatch } as unknown as QueryBus<any>;
        const middleware = createCacherMiddleware({ adapter, bus, defaultTtl: 100, defaultStaleTtl: 60 });

        await middleware(createEnvelope(makeMessage()), async () => {});
        const [key] = [...store.keys()];
        store.set(key, { timestamp: Date.now() / 1000 - 200, data: { data: 'old' } });

        // first stale call kicks off revalidation
        await middleware(createEnvelope(makeMessage()), async () => {});
        await handlerStarted; // ensure the revalidation is in flight

        // second stale call while the first is in flight
        await middleware(createEnvelope(makeMessage()), async () => {});
        await new Promise((r) => setTimeout(r, 50));

        expect(dispatch).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('clears inProgressRevalidations when the revalidation rejects', async () => {
        const dispatch = vi
            .fn()
            .mockRejectedValueOnce(new Error('boom'))
            .mockImplementationOnce(async (env: Envelope<TypedMessage<{ query: string }>>) => {
                await middleware(env, async () => {
                    env.addStamp('missive:handled', { data: 'fresh' });
                });
                return env;
            });
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bus = { dispatch } as unknown as QueryBus<any>;
        const middleware = createCacherMiddleware({ adapter, bus, defaultTtl: 100, defaultStaleTtl: 60 });

        await middleware(createEnvelope(makeMessage()), async () => {});
        const [key] = [...store.keys()];
        store.set(key, { timestamp: Date.now() / 1000 - 200, data: { data: 'old' } });

        await middleware(createEnvelope(makeMessage()), async () => {});
        await vi.waitFor(() => {
            expect(dispatch).toHaveBeenCalledTimes(1);
        });
        // let the rejected promise's .finally settle so inProgressRevalidations clears
        for (let i = 0; i < 10; i++) await Promise.resolve();

        // a subsequent stale call should be free to dispatch again
        await middleware(createEnvelope(makeMessage()), async () => {});
        await vi.waitFor(() => {
            expect(dispatch).toHaveBeenCalledTimes(2);
        });
    });
});

describe('createCacherMiddleware - intents config', () => {
    let store: Map<string, { timestamp: number; data: unknown }>;
    let adapter: CacherAdapter;

    beforeEach(() => {
        store = new Map();
        adapter = {
            get: vi.fn(async (key: string) => store.get(key) ?? null),
            set: vi.fn(async (key: string, value: unknown) => {
                store.set(key, value as { timestamp: number; data: unknown });
            }),
        };
    });

    it('intents.shortCircuit overrides the global default', async () => {
        const middleware = createCacherMiddleware({
            adapter,
            shortCircuit: true,
            intents: { 'no-shortcircuit': { shortCircuit: false } },
        });
        const message = { __type: 'no-shortcircuit', query: 'x' } as TypedMessage<{ query: string }>;
        const seed = createEnvelope(message);
        await middleware(seed, async () => {
            seed.addStamp('missive:handled', { data: 'old' });
        });

        const next = vi.fn<() => Promise<void>>();
        await middleware(createEnvelope(message), next);
        expect(next).toHaveBeenCalled();
    });

    it("intents.cache='only-cacheable' overrides global cache='all'", async () => {
        const middleware = createCacherMiddleware({
            adapter,
            cache: 'all',
            intents: { 'cacheable-only': { cache: 'only-cacheable' } },
        });

        const message = { __type: 'cacheable-only', query: 'x' } as TypedMessage<{ query: string }>;
        const envelope = createEnvelope(message);
        await middleware(envelope, async () => {
            envelope.addStamp('missive:handled', { data: 'fresh' });
        });
        // no missive:cacheable stamp → must NOT be cached despite global 'all'
        expect(adapter.set).not.toHaveBeenCalled();
    });

    it('intents.defaultTtl and defaultStaleTtl override globals', async () => {
        const middleware = createCacherMiddleware({
            adapter,
            defaultTtl: 100,
            defaultStaleTtl: 10,
            intents: { 'long-lived': { defaultTtl: 500, defaultStaleTtl: 50 } },
        });
        const message = { __type: 'long-lived', query: 'x' } as TypedMessage<{ query: string }>;
        const envelope = createEnvelope(message);
        await middleware(envelope, async () => {
            envelope.addStamp('missive:handled', { data: 'fresh' });
        });

        expect(adapter.set).toHaveBeenCalledWith(
            expect.any(String),
            expect.any(Object),
            550, // 500 + 50
        );
    });
});

describe('createCacherMiddleware - edge cases', () => {
    let adapter: CacherAdapter;
    beforeEach(() => {
        adapter = { get: vi.fn(), set: vi.fn() };
    });

    it('does not enter SWR when defaultStaleTtl is 0', async () => {
        const dispatch = vi.fn();
        //eslint-disable-next-line @typescript-eslint/no-explicit-any
        const bus = { dispatch } as unknown as QueryBus<any>;
        (adapter.get as ReturnType<typeof vi.fn>).mockResolvedValue({
            timestamp: Date.now() / 1000 - 4000,
            data: { data: 'stale' },
        });

        const middleware = createCacherMiddleware({ adapter, bus, defaultStaleTtl: 0 });
        const envelope = createEnvelope({ __type: 'm', q: 1 } as TypedMessage<{ q: number }>);
        await middleware(envelope, async () => {});

        expect(dispatch).not.toHaveBeenCalled();
    });
});
