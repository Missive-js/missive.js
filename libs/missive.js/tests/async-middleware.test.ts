import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Envelope } from '../src/core/envelope';
import { TypedMessage } from '../src/core/bus';
import { createAsyncMiddleware } from '../src/middlewares/async-middleware';

type MessageRegistry = {
    'test-message': {
        command: { id: number };
        result: {
            data: string;
        };
    };
};

describe('createAsyncMiddleware', () => {
    let next: ReturnType<typeof vi.fn<() => Promise<void>>>;
    let envelope: Envelope<TypedMessage<MessageRegistry['test-message']['command']>>;

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
    });

    it('should call produce function and add async stamp when consume is false', async () => {
        const produce = vi
            .fn<(envelope: Envelope<TypedMessage<unknown>>) => Promise<void>>()
            .mockResolvedValue(undefined);
        const middleware = createAsyncMiddleware<'command', MessageRegistry>({
            consume: false,
            produce,
        });

        await middleware(envelope, next);

        expect(produce).toHaveBeenCalledWith(envelope);
        expect(envelope.addStamp).toHaveBeenCalledWith('missive:async');
        expect(next).not.toHaveBeenCalled();
    });

    it('should call next when consume is true', async () => {
        const middleware = createAsyncMiddleware<'command', MessageRegistry>({
            consume: true,
        });

        await middleware(envelope, next);

        expect(next).toHaveBeenCalled();
    });

    it('should call intent produce function if defined', async () => {
        const intentProduce = vi
            .fn<(envelope: Envelope<TypedMessage<unknown>>) => Promise<void>>()
            .mockResolvedValue(undefined);
        const intentProdueSpecific = vi
            .fn<(envelope: Envelope<TypedMessage<unknown>>) => Promise<void>>()
            .mockResolvedValue(undefined);
        const middleware = createAsyncMiddleware<'command', MessageRegistry>({
            consume: false,
            produce: intentProduce,
            intents: {
                'test-message': {
                    produce: intentProdueSpecific,
                },
            },
        });

        await middleware(envelope, next);

        expect(intentProduce).not.toHaveBeenCalledWith(envelope);
        expect(intentProdueSpecific).toHaveBeenCalledWith(envelope);
        expect(envelope.addStamp).toHaveBeenCalledWith('missive:async');
        expect(next).not.toHaveBeenCalled();
    });

    it('should call next if async is false', async () => {
        const middleware = createAsyncMiddleware<'command', MessageRegistry>({
            consume: false,
            async: false,
            produce: vi.fn<(envelope: Envelope<TypedMessage<unknown>>) => Promise<void>>(),
        });

        await middleware(envelope, next);

        expect(next).toHaveBeenCalled();
        expect(envelope.addStamp).not.toHaveBeenCalled();
    });

    it('should call next if intent async is false', async () => {
        const intentProduce = vi
            .fn<(envelope: Envelope<TypedMessage<unknown>>) => Promise<void>>()
            .mockResolvedValue(undefined);
        const intentProdueSpecific = vi
            .fn<(envelope: Envelope<TypedMessage<unknown>>) => Promise<void>>()
            .mockResolvedValue(undefined);
        const middleware = createAsyncMiddleware<'command', MessageRegistry>({
            consume: false,
            produce: intentProduce,
            intents: {
                'test-message': {
                    async: false,
                    produce: intentProdueSpecific,
                },
            },
        });

        await middleware(envelope, next);

        expect(next).toHaveBeenCalled();
        expect(intentProduce).not.toHaveBeenCalledWith(envelope);
        expect(intentProdueSpecific).not.toHaveBeenCalledWith(envelope);
        expect(envelope.addStamp).not.toHaveBeenCalled();
    });
});
