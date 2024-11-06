import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Envelope } from '../src/core/envelope';
import { TypedMessage } from '../src/core/bus';
import { createValidatorMiddleware } from '../src/middlewares/validator-middleware';
import { MissiveMiddlewareError } from '../src/middlewares/errors';

function createEnvelope(id: number) {
    return {
        message: { __type: 'test message', id },
        stamps: [],
        addStamp: vi.fn(),
        firstStamp: vi.fn().mockReturnValue(undefined),
        stampsOfType: vi.fn().mockReturnValue([]),
    } as unknown as Envelope<TypedMessage<unknown>>;
}

const validator = (message: { id: number }) => {
    return message.id % 2 === 0;
};

describe('createValidatorMiddleware', () => {
    let middleware: ReturnType<typeof createValidatorMiddleware>;
    let envelope: Envelope<TypedMessage<unknown>>;
    let next: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        next = vi.fn();
    });

    it('should not throw an error if the does not have validator is valid', async () => {
        envelope = createEnvelope(1);
        middleware = createValidatorMiddleware();

        await middleware(envelope, next);

        expect(next).toHaveBeenCalled();
    });

    it('should throw an error if the validator returns false', async () => {
        envelope = createEnvelope(1);
        middleware = createValidatorMiddleware({
            'test message': validator,
        });

        await expect(middleware(envelope, next)).rejects.toThrow(
            new MissiveMiddlewareError('validator', 'Invalid message'),
        );
    });

    it('should not throw an error if the validator returns true', async () => {
        envelope = createEnvelope(2);
        middleware = createValidatorMiddleware({
            'test message': validator,
        });

        await middleware(envelope, next);

        expect(next).toHaveBeenCalled();
    });
});
