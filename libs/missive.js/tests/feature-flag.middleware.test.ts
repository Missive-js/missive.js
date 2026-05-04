import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFeatureFlagMiddleware } from '../src/middlewares/feature-flag-middleware';
import { Envelope } from '../src/core/envelope';
import { TypedMessage } from '../src/core/bus';

describe('createFeatureFlagMiddleware', () => {
    let featureFlagChecker: ReturnType<typeof vi.fn<(intent: string) => Promise<boolean>>>;
    let middleware: ReturnType<typeof createFeatureFlagMiddleware>;
    let envelope: Envelope<TypedMessage<object>>;
    let next: ReturnType<typeof vi.fn<() => Promise<void>>>;

    beforeEach(() => {
        featureFlagChecker = vi.fn<(intent: string) => Promise<boolean>>();
        envelope = {
            __type: 'test-message',
            message: { __type: 'test-message' },
            stamps: [],
            addStamp: vi.fn(),
            firstStamp: vi.fn(),
            lastStamp: vi.fn(),
        } as unknown as Envelope<TypedMessage<object>>;
        next = vi.fn<() => Promise<void>>();
    });

    it('should call next when feature flag is allowed', async () => {
        featureFlagChecker.mockResolvedValue(true);

        middleware = createFeatureFlagMiddleware({
            featureFlagChecker,
            intents: {},
        });

        await middleware(envelope, next);

        expect(featureFlagChecker).toHaveBeenCalledWith('test-message');
        expect(next).toHaveBeenCalled();
    });

    it('should call fallback handler and add stamps when feature flag is not allowed', async () => {
        featureFlagChecker.mockResolvedValue(false);
        const fallbackHandler = vi
            .fn<(envelope: Envelope<TypedMessage<unknown>>) => Promise<object | undefined | void | null>>()
            .mockResolvedValue({ data: 'fallback-result' });

        middleware = createFeatureFlagMiddleware({
            featureFlagChecker,
            intents: {
                'test-message': {
                    fallbackHandler,
                },
            },
        });

        await middleware(envelope, next);

        expect(featureFlagChecker).toHaveBeenCalledWith('test-message');
        expect(fallbackHandler).toHaveBeenCalledWith(envelope);
        expect(envelope.addStamp).toHaveBeenCalledWith('missive:handled', { data: 'fallback-result' });
        expect(envelope.addStamp).toHaveBeenCalledWith('missive:feature-flag-fallback');
        expect(next).not.toHaveBeenCalled();
    });

    it('should call next after fallback handler when shortCircuit is false', async () => {
        featureFlagChecker.mockResolvedValue(false);
        const fallbackHandler = vi
            .fn<(envelope: Envelope<TypedMessage<unknown>>) => Promise<object | undefined | void | null>>()
            .mockResolvedValue({ data: 'fallback-result' });

        middleware = createFeatureFlagMiddleware({
            featureFlagChecker,
            intents: {
                'test-message': {
                    fallbackHandler,
                    shortCircuit: false,
                },
            },
        });

        await middleware(envelope, next);

        expect(featureFlagChecker).toHaveBeenCalledWith('test-message');
        expect(fallbackHandler).toHaveBeenCalledWith(envelope);
        expect(envelope.addStamp).toHaveBeenCalledWith('missive:handled', { data: 'fallback-result' });
        expect(envelope.addStamp).toHaveBeenCalledWith('missive:feature-flag-fallback');
        expect(next).toHaveBeenCalled();
    });

    it('should throw an error when feature flag is not allowed and no fallback handler is provided', async () => {
        featureFlagChecker.mockResolvedValue(false);

        middleware = createFeatureFlagMiddleware({
            featureFlagChecker,
            intents: {},
        });

        await expect(middleware(envelope, next)).rejects.toThrow(
            'Intent test-message is not allowed and no fallback handler provided.',
        );

        expect(featureFlagChecker).toHaveBeenCalledWith('test-message');
        expect(next).not.toHaveBeenCalled();
    });
});
