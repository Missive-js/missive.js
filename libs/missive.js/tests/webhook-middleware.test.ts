import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createWebhookMiddleware } from '../src/middlewares/webhook-middleware';
import { Envelope } from '../src/core/envelope';
import { MessageRegistryType, TypedMessage } from '../src/core/bus';

describe('createWebhookMiddleware', () => {
    let envelope: Envelope<TypedMessage<{ payload: string }>>;
    let next: ReturnType<typeof vi.fn<() => Promise<void>>>;
    let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

    beforeEach(() => {
        envelope = {
            message: { __type: 'test-message', payload: 'mypayload' },
            stamps: [],
            addStamp: vi.fn(),
            firstStamp: vi.fn(),
            lastStamp: vi.fn(),
        } as unknown as Envelope<TypedMessage<{ payload: string }>>;
        next = vi.fn<() => Promise<void>>();
        fetchMock = vi.fn<typeof fetch>().mockResolvedValue({
            text: vi.fn().mockResolvedValue('response text'),
            status: 418,
        } as unknown as Response);
    });

    it('should call webhook endpoints in parallel', async () => {
        const middleware = createWebhookMiddleware<'command', MessageRegistryType<'command'>>({
            waitingAlgorithm: 'none',
            intents: {
                'test-message': {
                    async: false,
                    endpoints: [
                        {
                            url: 'https://example.com/webhook1',
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            signatureHeader: 'X-Signature',
                            signature: () => 'signature1',
                        },
                        {
                            url: 'https://example.com/webhook2',
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            signatureHeader: 'X-Signature',
                            signature: () => 'signature2',
                        },
                    ],
                },
            },
            async: false,
            parallel: true,
            fetcher: fetchMock,
        });

        await middleware(envelope, next);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock).toHaveBeenCalledWith('https://example.com/webhook1', expect.any(Object));
        expect(fetchMock).toHaveBeenCalledWith('https://example.com/webhook2', expect.any(Object));
        expect(envelope.addStamp).toHaveBeenCalledWith(
            'missive:webhook-called',
            expect.objectContaining({ attempt: 1 }),
        );
    });

    it('should call webhook endpoints sequentially', async () => {
        const middleware = createWebhookMiddleware<'command', MessageRegistryType<'command'>>({
            waitingAlgorithm: 'none',
            intents: {
                'test-message': {
                    endpoints: [
                        {
                            url: 'https://example.com/webhook1',
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            signatureHeader: 'X-Signature',
                            signature: () => 'signature1',
                        },
                        {
                            url: 'https://example.com/webhook2',
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            signatureHeader: 'X-Signature',
                            signature: () => 'signature2',
                        },
                    ],
                },
            },
            async: false,
            parallel: false,
            fetcher: fetchMock,
        });

        await middleware(envelope, next);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock).toHaveBeenCalledWith('https://example.com/webhook1', expect.any(Object));
        expect(fetchMock).toHaveBeenCalledWith('https://example.com/webhook2', expect.any(Object));
        expect(envelope.addStamp).toHaveBeenCalledWith(
            'missive:webhook-called',
            expect.objectContaining({ attempt: 1 }),
        );
    });

    it('should retry failed webhook calls up to maxAttempts', async () => {
        fetchMock.mockRejectedValueOnce(new Error('Network error'));
        fetchMock.mockResolvedValueOnce({
            text: vi.fn().mockResolvedValue('response text'),
            status: 200,
        } as unknown as Response);

        const middleware = createWebhookMiddleware<'command', MessageRegistryType<'command'>>({
            waitingAlgorithm: 'none',
            intents: {
                'test-message': {
                    endpoints: [
                        {
                            url: 'https://example.com/webhook1',
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            signatureHeader: 'X-Signature',
                            signature: () => 'signature1',
                        },
                    ],
                },
            },
            async: false,
            parallel: true,
            maxAttempts: 2,
            fetcher: fetchMock,
        });

        await middleware(envelope, next);

        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(fetchMock).toHaveBeenCalledWith('https://example.com/webhook1', expect.any(Object));
        expect(envelope.addStamp).toHaveBeenCalledWith(
            'missive:webhook-called',
            expect.objectContaining({ attempt: 2 }),
        );
    });

    it('should add correct stamps to the envelope', async () => {
        const middleware = createWebhookMiddleware<'command', MessageRegistryType<'command'>>({
            waitingAlgorithm: 'none',
            intents: {
                'test-message': {
                    endpoints: [
                        {
                            url: 'https://example.com/webhook1',
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            signatureHeader: 'X-Signature',
                            signature: () => 'signature1',
                        },
                    ],
                },
            },
            async: false,
            parallel: true,
            fetcher: fetchMock,
        });

        await middleware(envelope, next);

        expect(envelope.addStamp).toHaveBeenCalledWith(
            'missive:webhook-called',
            expect.objectContaining({
                attempt: 1,
                text: 'response text',
                status: 418,
            }),
        );
    });
});
