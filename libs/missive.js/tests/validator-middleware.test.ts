import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Envelope } from '../src/core/envelope';
import { TypedMessage } from '../src/core/bus';
import { createValidatorMiddleware } from '../src/middlewares/validator-middleware';
import { MissiveMiddlewareError } from '../src/core/errors';

function createEnvelope(id: number, resultId: number) {
    return {
        message: { __type: 'test message', id },
        stamps: [],
        lastStamp: vi.fn().mockReturnValue({ body: { data: resultId } }),
        addStamp: vi.fn(),
        firstStamp: vi.fn().mockReturnValue(undefined),
        stampsOfType: vi.fn().mockReturnValue([{ body: { data: resultId } }]),
    } as unknown as Envelope<TypedMessage<{ id: number }, 'test message'>>;
}

const validatorInput = (message: { id: number }): boolean => {
    return message.id % 2 === 0;
};

const validatorOutput = (result?: { data: number }): boolean => {
    return (result?.data || 0) % 2 === 1;
};

type Registry = {
    'test message': {
        command: { id: number };
        result: { data: number };
    };
};
describe('createValidatorMiddleware', () => {
    describe('input validator', () => {
        let middleware: ReturnType<typeof createValidatorMiddleware<'command', Registry>>;
        let envelope: Envelope<TypedMessage<{ id: number }>>;
        let next: ReturnType<typeof vi.fn>;

        beforeEach(() => {
            next = vi.fn();
        });

        it('should not throw an error if it does not have validator', async () => {
            envelope = createEnvelope(1, 2);
            middleware = createValidatorMiddleware();

            await middleware(envelope, next);

            expect(next).toHaveBeenCalled();
        });

        it('should throw an error if the validator returns false', async () => {
            envelope = createEnvelope(1, 2);
            middleware = createValidatorMiddleware<'command', Registry>({
                intents: {
                    'test message': {
                        input: validatorInput,
                    },
                },
            });

            await expect(middleware(envelope, next)).rejects.toThrow(
                new MissiveMiddlewareError('validator', 'Invalid message'),
            );
        });

        it('should not throw an error if the validator returns true', async () => {
            envelope = createEnvelope(2, 3);
            middleware = createValidatorMiddleware<'command', Registry>({
                intents: {
                    'test message': {
                        input: validatorInput,
                    },
                },
            });

            await middleware(envelope, next);

            expect(next).toHaveBeenCalled();
        });
    });

    describe('output validator', () => {
        let middleware: ReturnType<typeof createValidatorMiddleware<'command', Registry>>;
        let envelope: Envelope<TypedMessage<{ id: number }, 'test message'>>;
        let next: ReturnType<typeof vi.fn>;

        beforeEach(() => {
            next = vi.fn();
        });

        it('should not throw an error if it does not have validator', async () => {
            envelope = createEnvelope(1, 2);
            middleware = createValidatorMiddleware();

            await middleware(envelope, next);

            expect(next).toHaveBeenCalled();
        });

        it('should throw an error if the validator returns false', async () => {
            envelope = createEnvelope(1, 2);
            middleware = createValidatorMiddleware<'command', Registry>({
                intents: {
                    'test message': {
                        output: validatorOutput,
                    },
                },
            });

            await expect(middleware(envelope, next)).rejects.toThrow(
                new MissiveMiddlewareError('validator', 'Invalid result'),
            );
        });

        it('should not throw an error if the validator returns true', async () => {
            envelope = createEnvelope(2, 3);
            middleware = createValidatorMiddleware<'command', Registry>({
                intents: {
                    'test message': {
                        output: validatorOutput,
                    },
                },
            });

            await middleware(envelope, next);

            expect(next).toHaveBeenCalled();
        });
    });
});
