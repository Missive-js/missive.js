import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLoggerMiddleware, LoggerAdapter } from '../src/middlewares/logger-middleware';
import { Envelope } from '../src/core/envelope';

describe('createLoggerMiddleware', () => {
    let adapter: LoggerAdapter;
    let middleware: ReturnType<typeof createLoggerMiddleware>;
    let envelope: Envelope<unknown>;
    let next: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        adapter = {
            processing: vi.fn(),
            processed: vi.fn(),
            error: vi.fn(),
        };
        envelope = {
            message: 'test message',
            stamps: [],
            addStamp: vi.fn(),
            firstStamp: vi.fn().mockReturnValue(undefined),
            stampsOfType: vi.fn().mockReturnValue([]),
        } as unknown as Envelope<unknown>;
        next = vi.fn();
    });

    it('should log processing and processed steps when collect is false', async () => {
        middleware = createLoggerMiddleware({ adapter, collect: false, async: false });

        await middleware(envelope, next);

        expect(adapter.processing).toHaveBeenCalledWith(undefined, 'test message', [], []);
        expect(adapter.processed).toHaveBeenCalledWith(undefined, 'test message', [], []);
        expect(adapter.error).not.toHaveBeenCalled();
    });

    it('should log error step when an error is thrown', async () => {
        middleware = createLoggerMiddleware({ adapter, collect: false, async: false });
        next.mockRejectedValue(new Error('test error'));

        await expect(middleware(envelope, next)).rejects.toThrow('test error');

        expect(adapter.processing).toHaveBeenCalledWith(undefined, 'test message', [], []);
        expect(adapter.error).toHaveBeenCalledWith(undefined, 'test message', [], []);
        expect(adapter.processed).not.toHaveBeenCalled();
    });

    it('should collect logs and not await them when collect is true and async is true', async () => {
        middleware = createLoggerMiddleware({ adapter, collect: true, async: true });

        await middleware(envelope, next);

        expect(adapter.processing).toHaveBeenCalledWith(undefined, 'test message', [], []);
        expect(adapter.processed).toHaveBeenCalledWith(undefined, 'test message', [], []);
        expect(adapter.error).not.toHaveBeenCalled();
    });

    it('should collect logs and await them when collect is true and async is false', async () => {
        middleware = createLoggerMiddleware({ adapter, collect: true, async: false });

        await middleware(envelope, next);

        expect(adapter.processing).toHaveBeenCalledWith(undefined, 'test message', [], []);
        expect(adapter.processed).toHaveBeenCalledWith(undefined, 'test message', [], []);
        expect(adapter.error).not.toHaveBeenCalled();
    });
});
