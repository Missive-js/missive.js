import { BusKinds, MessageRegistryType } from '../core/bus.js';
import { Envelope, Stamp } from '../core/envelope.js';
import { Middleware } from '../core/middleware.js';
import { buildSleeper, Sleeper, sleeperFactory } from '../utils/sleeper.js';
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
export function createWebhookMiddleware<BusKind extends BusKinds, T extends MessageRegistryType<BusKind>>(
    options: Partial<Options<T>> = {},
): Middleware<BusKind, T> {
    const fetchFn = options.fetcher || fetch;
    const defaultSleeper = buildSleeper(options);
    const sleeperRegistry: Record<string, ReturnType<typeof sleeperFactory>> = {};

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
    ) => {
        let indexedEndpoints = endpoints.map((endpoint, index) => ({
            text: undefined,
            status: undefined,
            endpoint,
            index,
            attempt: 0,
        }));
        let attempt = 1;
        let results: PromiseSettledResult<{ text?: string; status?: number; index: number; attempt: number }>[];
        sleeper.reset();
        do {
            results = await Promise.allSettled(
                indexedEndpoints.map(async ({ endpoint, index }) => {
                    const { text, status } = await callEndpoint(endpoint, envelope);
                    return {
                        text,
                        status,
                        attempt,
                        index,
                    };
                }),
            );
            const failedEndpoints = indexedEndpoints.filter((_, idx) => results[idx].status === 'rejected');
            if (failedEndpoints.length === 0) break;
            indexedEndpoints = failedEndpoints;
            attempt++;
            await sleeper.wait();
        } while (attempt <= maxAttempts);

        return endpoints.map((_, i) => {
            const result = results[i];
            return result?.status === 'fulfilled'
                ? result.value
                : {
                      text: undefined,
                      status: undefined,
                      index: i,
                      attempt: maxAttempts,
                  };
        });
    };

    const callEndpointsSequentially = async (
        endpoints: WebhookEndpoint[],
        envelope: Envelope<unknown>,
        sleeper: Sleeper,
        maxAttempts: number,
    ) => {
        const indexedEndpoints: {
            text?: string;
            status?: number;
            index: number;
            attempt: number;
            endpoint: WebhookEndpoint;
        }[] = endpoints.map((endpoint, index) => ({ text: undefined, status: undefined, endpoint, index, attempt: 0 }));
        let attempt = 1;
        sleeper.reset();
        for (const { endpoint, index } of indexedEndpoints) {
            let text;
            let status;

            do {
                try {
                    const response = await callEndpoint(endpoint, envelope);
                    text = response.text;
                    status = response.status;
                    break;
                } catch {
                    attempt++;
                    await sleeper.wait();
                    continue;
                }
            } while (attempt <= maxAttempts);
            indexedEndpoints[index].attempt = attempt;
            indexedEndpoints[index].status = status;
            indexedEndpoints[index].text = text;
        }
        return indexedEndpoints;
    };

    return async (envelope, next) => {
        await next();
        const type = envelope.message.__type;
        if (options?.intents?.[type] && !sleeperRegistry[type]) {
            sleeperRegistry[type] = buildSleeper(options.intents[type]);
        }
        const maxAttempts = options.intents?.[type]?.maxAttempts || options.maxAttempts || 3;
        const sleeper = sleeperRegistry[type] || defaultSleeper;
        const parallel = options.intents?.[type]?.parallel ?? options.parallel;
        const async = options.intents?.[type]?.async ?? options.async;

        if (options.intents?.[type]) {
            const endpoints = options.intents[type].endpoints;
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
        }
    };
}
