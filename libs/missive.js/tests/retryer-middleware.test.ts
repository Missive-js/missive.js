import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRetryerMiddleware, RetriedStamp } from '../src/middlewares/retryer-middleware';
import { createEnvelope, Envelope } from '../src/core/envelope';
import { TypedMessage } from '../src/core/bus';

describe('createRetryerMiddleware', () => {
    let nextMock: ReturnType<typeof vi.fn<() => Promise<void>>>;
    let envelope: Envelope<TypedMessage<unknown>>;

    beforeEach(() => {
        nextMock = vi.fn<() => Promise<void>>();
        envelope = {
            ...createEnvelope('test message'),
            __type: 'test-message',
        } as unknown as Envelope<TypedMessage<unknown>>;
    });

    it('should retry the correct number of times with none algorithm', async () => {
        const middleware = createRetryerMiddleware({
            maxAttempts: 5,
            waitingAlgorithm: 'none',
        });
        nextMock.mockRejectedValueOnce(new Error('Test Error'));
        nextMock.mockRejectedValueOnce(new Error('Test Error'));
        nextMock.mockResolvedValueOnce(undefined);
        await middleware(envelope, nextMock);
        expect(nextMock).toHaveBeenCalledTimes(3);
        const retriedStamps = envelope.stampsOfType<RetriedStamp>('missive:retried');
        expect(retriedStamps?.length || 0).toBe(2);
    });

    it('should add retried stamp on error', async () => {
        const middleware = createRetryerMiddleware({
            maxAttempts: 3,
            waitingAlgorithm: 'none',
        });
        nextMock.mockRejectedValueOnce(new Error('Test Error'));

        try {
            await middleware(envelope, nextMock);
        } catch {
            // expected to throw
        }
        const retriedStamps = envelope.stampsOfType<RetriedStamp>('missive:retried');
        expect(retriedStamps?.length || 0).toBe(1);
        expect(retriedStamps[0]!.body!.attempt).toBe(1);
        expect(retriedStamps[0]!.body!.errorMessage).toBe('Test Error');
    });

    it('should stop retrying after max attempts', async () => {
        const middleware = createRetryerMiddleware({
            maxAttempts: 2,
            waitingAlgorithm: 'none',
        });
        nextMock.mockRejectedValue(new Error('Test Error'));

        try {
            await middleware(envelope, nextMock);
        } catch {
            // expected to throw
        }

        expect(nextMock).toHaveBeenCalledTimes(2);
    });

    it('should not retry if no error occurs', async () => {
        const middleware = createRetryerMiddleware({
            maxAttempts: 3,
            waitingAlgorithm: 'none',
        });
        nextMock.mockResolvedValueOnce(undefined);

        await middleware(envelope, nextMock);

        expect(nextMock).toHaveBeenCalledTimes(1);
        expect(envelope.stamps).not.toContainEqual(expect.objectContaining({ type: 'missive:retried' }));
    });

    it('should respect maxAttempts and throw last error', async () => {
        const middleware = createRetryerMiddleware({
            maxAttempts: 2,
            waitingAlgorithm: 'none',
        });
        nextMock.mockRejectedValue(new Error('test error'));
        await expect(middleware(envelope, nextMock)).rejects.toThrow('test error');
        expect(nextMock).toHaveBeenCalledTimes(2);
    });

    it('should handle error stamps from next middleware', async () => {
        const middleware = createRetryerMiddleware({
            maxAttempts: 3,
            waitingAlgorithm: 'none',
        });

        nextMock.mockImplementationOnce(() => {
            envelope.addStamp('error', { message: 'test error' });
            return Promise.resolve();
        });
        nextMock.mockImplementationOnce(() => {
            envelope.addStamp('error', { message: 'test error' });
            return Promise.resolve();
        });
        nextMock.mockResolvedValueOnce(undefined);
        await middleware(envelope, nextMock);
        expect(nextMock).toHaveBeenCalledTimes(3);
    });
});
