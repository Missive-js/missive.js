import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createMockerMiddleware } from '../src/middlewares/mocker-middleware';
import { Envelope } from '../src/core/envelope';
import { TypedMessage } from '../src/core/bus';

describe('createMockerMiddleware', () => {
    type HandlerFn = (envelope: Envelope<TypedMessage<unknown>>) => Promise<object | undefined | void | null>;
    let envelope: Envelope<TypedMessage<unknown>>;
    let next: ReturnType<typeof vi.fn<() => Promise<void>>>;
    let handler: ReturnType<typeof vi.fn<HandlerFn>>;

    beforeEach(() => {
        envelope = {
            message: { __type: 'testType' },
            stamps: [],
            addStamp: vi.fn(),
            firstStamp: vi.fn().mockReturnValue(undefined),
            stampsOfType: vi.fn().mockReturnValue([]),
        } as unknown as Envelope<TypedMessage<unknown>>;
        next = vi.fn<() => Promise<void>>();
        handler = vi.fn<HandlerFn>().mockResolvedValue({ data: 'testResult' });
    });

    it('should call the handler and add a handled stamp when the handler is defined', async () => {
        const middleware = createMockerMiddleware({
            intents: {
                testType: handler,
            },
        });

        await middleware(envelope, next);

        expect(handler).toHaveBeenCalledWith(envelope);
        expect(envelope.addStamp).toHaveBeenCalledWith('missive:handled', { data: 'testResult' });
        expect(next).toHaveBeenCalled();
    });

    it('should not call the handler or add a handled stamp when the handler is not defined', async () => {
        const middleware = createMockerMiddleware({
            intents: {},
        });

        await middleware(envelope, next);

        expect(handler).not.toHaveBeenCalled();
        expect(envelope.addStamp).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalled();
    });
});
