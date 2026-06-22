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

    const endpoint = (path: string) => ({
        url: `https://x/${path}`,
        method: 'POST' as const,
        headers: { 'Content-Type': 'application/json' },
        signatureHeader: 'X-Signature',
        signature: () => 'sig',
    });

    const webhookStamps = () =>
        (envelope.addStamp as ReturnType<typeof vi.fn>).mock.calls
            .filter((c) => c[0] === 'missive:webhook-called')
            .map((c) => c[1] as { attempt: number; text?: string; status?: number });

    it('fires endpoints configured at the top level (not nested under intents)', async () => {
        const middleware = createWebhookMiddleware<'command', MessageRegistryType<'command'>>({
            waitingAlgorithm: 'none',
            async: false,
            parallel: true,
            endpoints: [endpoint('top')],
            fetcher: fetchMock,
        });

        await middleware(envelope, next);

        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(fetchMock).toHaveBeenCalledWith('https://x/top', expect.any(Object));
    });

    it('attributes parallel results to the correct endpoint after a retry', async () => {
        const calls: Record<string, number> = {};
        const fetcher = vi.fn(async (url: unknown) => {
            const u = String(url);
            calls[u] = (calls[u] ?? 0) + 1;
            if (u.endsWith('/b') && calls[u] === 1) throw new Error('network');
            return { status: 200, text: async () => `ok:${u}` } as unknown as Response;
        });

        const middleware = createWebhookMiddleware<'command', MessageRegistryType<'command'>>({
            waitingAlgorithm: 'none',
            async: false,
            parallel: true,
            maxAttempts: 2,
            intents: { 'test-message': { endpoints: [endpoint('a'), endpoint('b')] } },
            fetcher: fetcher as unknown as typeof fetch,
        });

        await middleware(envelope, next);

        const stamps = webhookStamps();
        // endpoint a (index 0) succeeded on attempt 1 — must NOT receive b's result
        expect(stamps[0]).toMatchObject({ status: 200, text: 'ok:https://x/a', attempt: 1 });
        // endpoint b (index 1) actually succeeded on attempt 2 — must NOT be reported as failed
        expect(stamps[1]).toMatchObject({ status: 200, text: 'ok:https://x/b', attempt: 2 });
        // a succeeded on the first round, so it must not be retried
        expect(calls['https://x/a']).toBe(1);
        expect(calls['https://x/b']).toBe(2);
    });

    it('gives each endpoint its own retry budget in sequential mode', async () => {
        const calls: Record<string, number> = {};
        const fetcher = vi.fn(async (url: unknown) => {
            const u = String(url);
            calls[u] = (calls[u] ?? 0) + 1;
            if (u.endsWith('/a')) throw new Error('a always fails');
            if (u.endsWith('/b') && calls[u] === 1) throw new Error('b fails once');
            return { status: 200, text: async () => 'ok' } as unknown as Response;
        });

        const middleware = createWebhookMiddleware<'command', MessageRegistryType<'command'>>({
            waitingAlgorithm: 'none',
            async: false,
            parallel: false,
            maxAttempts: 2,
            intents: { 'test-message': { endpoints: [endpoint('a'), endpoint('b')] } },
            fetcher: fetcher as unknown as typeof fetch,
        });

        await middleware(envelope, next);

        // a exhausting its budget must not starve b: b is retried and succeeds
        expect(calls['https://x/a']).toBe(2);
        expect(calls['https://x/b']).toBe(2);
        expect(webhookStamps()[1]).toMatchObject({ status: 200 });
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
