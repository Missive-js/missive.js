import { BusKinds, MessageRegistryType } from '../core/bus.js';
import { Envelope, Stamp } from '../core/envelope.js';
import { Middleware } from '../core/middleware.js';
import { buildSleeper, Sleeper } from '../utils/sleeper.js';
import { RetryConfiguration } from '../utils/types.js';

type WebhookEndpoint = {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    headers: Record<string, string>;
    signatureHeader: string;
    signature: (payload: string) => string;
};

type BasicOptions = RetryConfiguration & {
    async?: boolean;
    parallel?: boolean;
    endpoints: WebhookEndpoint[];
};

type Options<Def> = BasicOptions & {
    intents: Partial<Record<keyof Def, BasicOptions>>;
    fetcher?: typeof fetch;
};

export type WebhookCalledStamp = Stamp<{ attempt: number; text?: string; status?: number }, 'missive:webhook-called'>;

type EndpointCallResult = { text?: string; status?: number; index: number; attempt: number };

export function createWebhookMiddleware<BusKind extends BusKinds, T extends MessageRegistryType<BusKind>>(
    options: Partial<Options<T>> = {},
): Middleware<BusKind, T> {
    const fetchFn = options.fetcher || fetch;

    const callEndpoint = async (endpoint: WebhookEndpoint, envelope: Envelope<unknown>) => {
        const body = JSON.stringify(envelope);
        const response = await fetchFn(endpoint.url, {
            method: endpoint.method,
            headers: {
                ...endpoint.headers,
                ...(endpoint.signature && {
                    [endpoint.signatureHeader]: endpoint.signature(body),
                }),
            },
            body,
        });
        return {
            status: response.status,
            text: await response.text(),
        };
    };

    const callEndpointsInParallel = async (
        endpoints: WebhookEndpoint[],
        envelope: Envelope<unknown>,
        sleeper: Sleeper,
        maxAttempts: number,
    ): Promise<EndpointCallResult[]> => {
        // one slot per ORIGINAL endpoint index, so results never desync from their endpoint across retry rounds
        const finalResults: EndpointCallResult[] = endpoints.map((_, index) => ({
            text: undefined,
            status: undefined,
            index,
            attempt: 0,
        }));
        let pending = endpoints.map((endpoint, index) => ({ endpoint, index }));
        let attempt = 1;
        sleeper.reset();
        while (pending.length > 0) {
            const settled = await Promise.allSettled(pending.map(({ endpoint }) => callEndpoint(endpoint, envelope)));
            const stillFailing: { endpoint: WebhookEndpoint; index: number }[] = [];
            settled.forEach((result, i) => {
                const { endpoint, index } = pending[i];
                if (result.status === 'fulfilled') {
                    finalResults[index] = { ...result.value, index, attempt };
                } else {
                    finalResults[index] = { text: undefined, status: undefined, index, attempt };
                    stillFailing.push({ endpoint, index });
                }
            });
            if (stillFailing.length === 0) break;
            attempt++;
            if (attempt > maxAttempts) break;
            // only the still-failing endpoints are retried in the next round
            pending = stillFailing;
            await sleeper.wait();
        }
        return finalResults;
    };

    const callEndpointsSequentially = async (
        endpoints: WebhookEndpoint[],
        envelope: Envelope<unknown>,
        sleeper: Sleeper,
        maxAttempts: number,
    ): Promise<EndpointCallResult[]> => {
        const results: EndpointCallResult[] = endpoints.map((_, index) => ({
            text: undefined,
            status: undefined,
            index,
            attempt: 0,
        }));
        for (let index = 0; index < endpoints.length; index++) {
            const endpoint = endpoints[index];
            // each endpoint gets its own attempt budget and backoff schedule
            let attempt = 1;
            sleeper.reset();
            let text: string | undefined;
            let status: number | undefined;
            for (;;) {
                try {
                    const response = await callEndpoint(endpoint, envelope);
                    text = response.text;
                    status = response.status;
                    break;
                } catch {
                    attempt++;
                    if (attempt > maxAttempts) break;
                    await sleeper.wait();
                }
            }
            results[index] = { text, status, index, attempt };
        }
        return results;
    };

    return async (envelope, next) => {
        await next();
        const type = envelope.message.__type;
        const intent = options.intents?.[type];
        // endpoints may be configured per-intent or at the top level
        const endpoints = intent?.endpoints ?? options.endpoints;
        if (!endpoints || endpoints.length === 0) {
            return;
        }
        const maxAttempts = intent?.maxAttempts ?? options.maxAttempts ?? 3;
        // build a fresh sleeper per dispatch so concurrent dispatches don't corrupt each other's backoff state
        const sleeper = buildSleeper(intent ?? options);
        const parallel = intent?.parallel ?? options.parallel;
        const async = intent?.async ?? options.async;

        const results = await (async () => {
            if (parallel) {
                if (!async) {
                    return await callEndpointsInParallel(endpoints, envelope, sleeper, maxAttempts);
                }
                callEndpointsInParallel(endpoints, envelope, sleeper, maxAttempts);
                return [];
            }
            if (!async) {
                return await callEndpointsSequentially(endpoints, envelope, sleeper, maxAttempts);
            }
            callEndpointsSequentially(endpoints, envelope, sleeper, maxAttempts);
            return [];
        })();
        for (const result of results) {
            envelope.addStamp<WebhookCalledStamp>('missive:webhook-called', {
                attempt: result.attempt,
                text: result.text,
                status: result.status,
            });
        }
    };
}
