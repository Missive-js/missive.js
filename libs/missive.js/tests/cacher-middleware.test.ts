import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCacherMiddleware, CacherAdapter } from '../src/middlewares/cacher-middleware';
import { Envelope } from '../src/core/envelope';

describe('createCacherMiddleware', () => {
    let adapter: CacherAdapter;
    let middleware: ReturnType<typeof createCacherMiddleware>;
    let envelope: Envelope<object>;
    let next: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        adapter = {
            get: vi.fn(),
            set: vi.fn(),
        };
        envelope = {
            message: { query: 'test' },
            stamps: [],
            addStamp: vi.fn(),
            firstStamp: vi.fn(),
            lastStamp: vi.fn(),
        } as unknown as Envelope<object>;
        next = vi.fn();
    });

    it('should use cache when cache is hit', async () => {
        (adapter.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: 'cached' });

        middleware = createCacherMiddleware({ adapter });

        await middleware(envelope, next);

        expect(adapter.get).toHaveBeenCalled();
        expect(envelope.addStamp).toHaveBeenCalledWith('missive:handled', { data: 'cached' });
        expect(envelope.addStamp).toHaveBeenCalledWith('missive:cache:hit');
        expect(next).not.toHaveBeenCalled();
    });

    it('should call next and cache result when cache is missed', async () => {
        (adapter.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        (envelope.lastStamp as ReturnType<typeof vi.fn>).mockReturnValue({ body: { data: 'result' } });

        middleware = createCacherMiddleware({ adapter });

        await middleware(envelope, next);

        expect(adapter.get).toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
        expect(adapter.set).toHaveBeenCalledWith(expect.any(String), { data: 'result' }, 3600);
    });

    it('should respect cacheable stamp ttl', async () => {
        (adapter.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        (envelope.lastStamp as ReturnType<typeof vi.fn>).mockReturnValue({ body: { data: 'result' } });
        (envelope.firstStamp as ReturnType<typeof vi.fn>).mockReturnValue({ body: { ttl: 100 } });

        middleware = createCacherMiddleware({ adapter });

        await middleware(envelope, next);

        expect(adapter.get).toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
        expect(adapter.set).toHaveBeenCalledWith(expect.any(String), { data: 'result' }, 100);
    });

    it('should use default ttl when cacheable stamp is not present', async () => {
        (adapter.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        (envelope.lastStamp as ReturnType<typeof vi.fn>).mockReturnValue({ body: { data: 'result' } });

        middleware = createCacherMiddleware({ adapter, defaultTtl: 500 });

        await middleware(envelope, next);

        expect(adapter.get).toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
        expect(adapter.set).toHaveBeenCalledWith(expect.any(String), { data: 'result' }, 500);
    });

    it('should cache only cacheable messages when cache is set to only-cacheable', async () => {
        (adapter.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
        (envelope.lastStamp as ReturnType<typeof vi.fn>).mockReturnValue({ body: { data: 'result' } });

        middleware = createCacherMiddleware({ adapter, cache: 'only-cacheable' });

        await middleware(envelope, next);

        expect(adapter.get).toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
        expect(adapter.set).not.toHaveBeenCalled();

        (envelope.firstStamp as ReturnType<typeof vi.fn>).mockReturnValue({ body: { ttl: 100 } });

        await middleware(envelope, next);

        expect(adapter.set).toHaveBeenCalledWith(expect.any(String), { data: 'result' }, 100);
    });
});
