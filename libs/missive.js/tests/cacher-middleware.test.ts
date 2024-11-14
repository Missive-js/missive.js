import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCacherMiddleware, CacherAdapter } from '../src/middlewares/cacher-middleware';
import { Envelope } from '../src/core/envelope';
import { QueryBus, TypedMessage } from '../src/core/bus';

describe('createCacherMiddleware', () => {
    let adapter: CacherAdapter;
    let middleware: ReturnType<typeof createCacherMiddleware>;
    let envelope: Envelope<TypedMessage<object>>;
    let next: ReturnType<typeof vi.fn>;

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
        next = vi.fn();
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
        middleware = createCacherMiddleware({ adapter, cache: 'only-cacheable' });

        await middleware(envelope, next);

        expect(adapter.get).toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
        expect(adapter.set).not.toHaveBeenCalled();

        (envelope.firstStamp as ReturnType<typeof vi.fn>).mockReturnValueOnce(null); // reprocessed call
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

    it('should not loop when dispatching in the same bus for revalidation', async () => {
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
        expect(bus.dispatch).toHaveBeenCalledTimes(1);
        expect(next).not.toHaveBeenCalled();
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

    it('should avoid infinite loop when dispatching in the same bus for revalidation', async () => {
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
        expect(bus.dispatch).toHaveBeenCalledTimes(1);
        expect(next).not.toHaveBeenCalled();
    });
});
