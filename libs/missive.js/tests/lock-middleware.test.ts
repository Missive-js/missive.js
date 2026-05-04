import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Envelope } from '../src/core/envelope';
import { TypedMessage } from '../src/core/bus';
import { createLockMiddleware, LockAdapter } from '../src/middlewares/lock-middleware';

type MessageRegistry = {
    'test-message': {
        command: { id: number };
        result: {
            data: string;
        };
    };
};
describe('createLockMiddleware', () => {
    let next: ReturnType<typeof vi.fn<() => Promise<void>>>;
    let envelope: Envelope<TypedMessage<MessageRegistry['test-message']['command']>>;
    let adapter: LockAdapter;

    beforeEach(() => {
        next = vi.fn<() => Promise<void>>();
        envelope = {
            message: { __type: 'test-message', id: 1 },
            stamps: [],
            stampsOfType: vi.fn(),
            addStamp: vi.fn(),
            firstStamp: vi.fn(),
            lastStamp: vi.fn(),
        };
        adapter = {
            acquire: vi.fn(),
            release: vi.fn(),
        };
    });

    it('work when everything is working', async () => {
        const middleware = createLockMiddleware<'command', MessageRegistry>({
            getLockKey: async (e: Envelope<TypedMessage<MessageRegistry['test-message']['command']>>) => {
                return e.message.id.toString();
            },
            adapter,
            timeout: 0,
        });

        (adapter.acquire as ReturnType<typeof vi.fn>).mockResolvedValue(true);

        await middleware(envelope, next);

        expect(next).toHaveBeenCalled();
        expect(adapter.acquire).toHaveBeenCalledOnce();
        expect(adapter.release).toHaveBeenCalledOnce();
    });
    it('should throw an error if next is throwing an error', async () => {
        const middleware = createLockMiddleware<'command', MessageRegistry>({
            getLockKey: async (e: Envelope<TypedMessage<MessageRegistry['test-message']['command']>>) => {
                return e.message.id.toString();
            },
            adapter,
            timeout: 0,
        });

        (adapter.acquire as ReturnType<typeof vi.fn>).mockResolvedValue(true);
        (next as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Test Error'));

        await expect(middleware(envelope, next)).rejects.toThrow('Test Error');
        expect(adapter.acquire).toHaveBeenCalledOnce();
        expect(adapter.release).toHaveBeenCalledOnce();
    });

    it('should throw an error if the lock is not acquired and there is no timeout', async () => {
        const middleware = createLockMiddleware<'command', MessageRegistry>({
            getLockKey: async (e: Envelope<TypedMessage<MessageRegistry['test-message']['command']>>) => {
                return e.message.id.toString();
            },
            adapter,
            timeout: 0,
        });
        (adapter.acquire as ReturnType<typeof vi.fn>).mockResolvedValue(false);

        await expect(middleware(envelope, next)).rejects.toThrow('Lock not acquired or timeout');
    });

    it('should retry to get the lock', async () => {
        const middleware = createLockMiddleware<'command', MessageRegistry>({
            getLockKey: async (e: Envelope<TypedMessage<MessageRegistry['test-message']['command']>>) => {
                return e.message.id.toString();
            },
            adapter,
            timeout: 200,
        });
        (adapter.acquire as ReturnType<typeof vi.fn>).mockResolvedValueOnce(false).mockResolvedValueOnce(true);

        await middleware(envelope, next);

        expect(next).toHaveBeenCalled();
        expect(adapter.acquire).toHaveBeenCalledTimes(2);
        expect(adapter.release).toHaveBeenCalledOnce();
    });
});
