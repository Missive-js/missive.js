import { Schema } from 'zod';
import { createEnvelope, Envelope } from './envelope';

type BusType = 'query' | 'command' | 'event';
type AllMessages<B extends BusType, HD extends Record<string, HandlerDefinition<B>>> = HD[keyof HD][B];
type TypedMessage<Q, D extends string = string> = Q & { __type: D };
export type Middleware<B extends BusType, HD extends Record<string, HandlerDefinition<B>>> = (
    envelope: Envelope<AllMessages<B, HD>>,
    next: () => Promise<void>,
) => Promise<void>;

type Handler<Q, R> = (envelope: Envelope<Q>) => Promise<R>;
type HandlerDefinition<B extends BusType, Q = object, R = object> = {
    [key in B]: Q;
} & {
    result: R;
};

export type Bus<B extends BusType, HD extends Record<string, HandlerDefinition<B>>> = {
    useMiddleware: (middleware: Middleware<B, HD>) => void;
    registerHandler: <K extends keyof HD & string>(
        type: K,
        schema: Schema<HD[K][B]>,
        handler: Handler<HD[K][B], HD[K]['result']>,
    ) => void;
    dispatch: <K extends keyof HD & string>(
        intent: TypedMessage<HD[K][B], K>,
    ) => Promise<{ envelope: Envelope<HD[K][B]>; result: HD[K]['result'] | undefined }>;
    createIntent: <K extends keyof HD & string>(type: K, intent: HD[K][B]) => TypedMessage<HD[K][B], K>;
};

export const createBus = <B extends BusType, HD extends Record<string, HandlerDefinition<B>>>(): Bus<B, HD> => {
    const middlewares: Middleware<B, HD>[] = [];

    const registry: {
        [K in keyof HD & string]?: {
            schema: Schema<HD[K][B]>;
            handlers: Handler<HD[K][B], HD[K]['result']>[];
        };
    } = {};

    const use = (middleware: Middleware<B, HD>) => {
        middlewares.push(middleware);
    };

    const registerHandler = <K extends keyof HD & string>(
        type: K,
        schema: Schema<HD[K][B]>,
        handler: Handler<HD[K][B], HD[K]['result']>,
    ) => {
        if (!registry[type]) {
            registry[type] = { schema, handlers: [] };
        }
        registry[type].handlers.push(handler);
    };

    const createMiddlewareChain = <K extends keyof HD & string>(handlers: Handler<HD[K][B], HD[K]['result']>[]) => {
        return async (message: HD[K][B]) => {
            const envelope: Envelope<HD[K][B]> = createEnvelope(message);
            let index = 0;

            const next = async () => {
                if (index < middlewares.length) {
                    const middleware = middlewares[index++];
                    await middleware(envelope, next);
                } else {
                    if (handlers.length === 1) {
                        const result = await handlers[0](envelope);
                        envelope.addStamp<HD[K]['result']>('handled', result);
                    } else {
                        const results = await Promise.all(handlers.map(async (handler) => await handler(envelope)));
                        results.forEach((result) => envelope.addStamp<HD[K]['result']>('handled', result));
                    }
                }
            };

            await next();
            return envelope;
        };
    };

    const dispatch = async <K extends keyof HD & string>(
        message: TypedMessage<HD[K][B], K>,
    ): Promise<{ envelope: Envelope<HD[K][B]>; result: HD[K]['result'] | undefined }> => {
        const entry = registry[message.__type];
        if (!entry) {
            throw new Error(`No handler found for type: ${message.__type}`);
        }

        const { handlers } = entry;
        const chain = createMiddlewareChain<K>(handlers);
        const envelope = await chain(message);
        return {
            envelope,
            // this is on purpose we return the last handled result
            // if the user wants to access the result of a specific handler, it can be done via the envelope
            result: envelope.lastStamp<HD[K]['result']>('handled')?.context,
        };
    };

    const createIntent = <K extends keyof HD & string>(type: K, intent: HD[K][B]): TypedMessage<HD[K][B], K> => {
        const entry = registry[type];
        if (!entry) {
            throw new Error(`No handler found for type: ${type}`);
        }
        const { schema } = entry;
        const parsed = schema.parse(intent);
        return {
            __type: type,
            ...parsed,
        };
    };
    return {
        useMiddleware: use,
        createIntent,
        registerHandler: registerHandler,
        dispatch,
    };
};
