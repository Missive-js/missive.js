import { Schema as ZodSchema } from 'zod';
import { createEnvelope, Envelope } from './envelope';

type BusKinds = 'query' | 'command' | 'event';

type MessageRegistryType<BusKind extends BusKinds> = Record<string, HandlerDefinition<BusKind>>;
type MessageRegistry<
    BusKind extends BusKinds,
    HandlerDefinitions extends MessageRegistryType<BusKind>,
> = HandlerDefinitions[keyof HandlerDefinitions][BusKind];

type TypedMessage<Message, MessageName extends string = string> = Message & { __type: MessageName };

export type Middleware<BusKind extends BusKinds, HandlerDefinitions extends MessageRegistryType<BusKind>> = (
    envelope: Envelope<MessageRegistry<BusKind, HandlerDefinitions>>,
    next: () => Promise<void>,
) => Promise<void>;

type MessageHandler<Q, Result> = (envelope: Envelope<Q>) => Promise<Result>;
type HandlerDefinition<BusKind extends BusKinds, Q = object, Result = object> = {
    [key in BusKind]: Q;
} & {
    result: Result;
};

export type MissiveBus<BusKind extends BusKinds, HandlerDefinitions extends MessageRegistryType<BusKind>> = {
    useMiddleware: (middleware: Middleware<BusKind, HandlerDefinitions>) => void;
    registerHandler: <MessageKind extends keyof HandlerDefinitions & string>(
        type: MessageKind,
        schema: ZodSchema<HandlerDefinitions[MessageKind][BusKind]>,
        handler: MessageHandler<HandlerDefinitions[MessageKind][BusKind], HandlerDefinitions[MessageKind]['result']>,
    ) => void;
    dispatch: <MessageKind extends keyof HandlerDefinitions & string>(
        intent: TypedMessage<HandlerDefinitions[MessageKind][BusKind], MessageKind>,
    ) => Promise<{
        envelope: Envelope<HandlerDefinitions[MessageKind][BusKind]>;
        result: HandlerDefinitions[MessageKind]['result'] | undefined;
    }>;
    createIntent: <MessageKind extends keyof HandlerDefinitions & string>(
        type: MessageKind,
        intent: HandlerDefinitions[MessageKind][BusKind],
    ) => TypedMessage<HandlerDefinitions[MessageKind][BusKind], MessageKind>;
};

export const createBus = <
    BusKind extends BusKinds,
    HandlerDefinitions extends MessageRegistryType<BusKind>,
>(): MissiveBus<BusKind, HandlerDefinitions> => {
    const middlewares: Middleware<BusKind, HandlerDefinitions>[] = [];

    const registry: {
        [MessageName in keyof HandlerDefinitions & string]?: {
            schema: ZodSchema<HandlerDefinitions[MessageName][BusKind]>;
            handlers: MessageHandler<
                HandlerDefinitions[MessageName][BusKind],
                HandlerDefinitions[MessageName]['result']
            >[];
        };
    } = {};

    const useMiddleware = (middleware: Middleware<BusKind, HandlerDefinitions>) => {
        middlewares.push(middleware);
    };

    const registerHandler = <MessageName extends keyof HandlerDefinitions & string>(
        messageName: MessageName,
        schema: ZodSchema<HandlerDefinitions[MessageName][BusKind]>,
        handler: MessageHandler<HandlerDefinitions[MessageName][BusKind], HandlerDefinitions[MessageName]['result']>,
    ) => {
        if (!registry[messageName]) {
            registry[messageName] = { schema, handlers: [] };
        }
        registry[messageName].handlers.push(handler);
    };

    const createMiddlewareChain = <MessageName extends keyof HandlerDefinitions & string>(
        handlers: MessageHandler<HandlerDefinitions[MessageName][BusKind], HandlerDefinitions[MessageName]['result']>[],
    ) => {
        return async (message: HandlerDefinitions[MessageName][BusKind]) => {
            const envelope: Envelope<HandlerDefinitions[MessageName][BusKind]> = createEnvelope(message);
            let index = 0;

            const next = async () => {
                if (index < middlewares.length) {
                    const middleware = middlewares[index++];
                    await middleware(envelope, next);
                } else {
                    if (handlers.length === 1) {
                        const result = await handlers[0](envelope);
                        envelope.addStamp<HandlerDefinitions[MessageName]['result']>('handled', result);
                    } else {
                        const results = await Promise.all(handlers.map(async (handler) => await handler(envelope)));
                        results.forEach((result) =>
                            envelope.addStamp<HandlerDefinitions[MessageName]['result']>('handled', result),
                        );
                    }
                }
            };

            await next();
            return envelope;
        };
    };

    const dispatch = async <MessageName extends keyof HandlerDefinitions & string>(
        message: TypedMessage<HandlerDefinitions[MessageName][BusKind], MessageName>,
    ): Promise<{
        envelope: Envelope<HandlerDefinitions[MessageName][BusKind]>;
        result: HandlerDefinitions[MessageName]['result'] | undefined;
    }> => {
        const entry = registry[message.__type];
        if (!entry) {
            throw new Error(`No handler found for type: ${message.__type}`);
        }

        const { handlers } = entry;
        const chain = createMiddlewareChain<MessageName>(handlers);
        const envelope = await chain(message);
        return {
            envelope,
            // this is on purpose we return the last handled result
            // if the user wants to access the result of a specific handler, it can be done via the envelope
            result: envelope.lastStamp<HandlerDefinitions[MessageName]['result']>('handled')?.context,
        };
    };

    const createIntent = <MessageName extends keyof HandlerDefinitions & string>(
        type: MessageName,
        intent: HandlerDefinitions[MessageName][BusKind],
    ): TypedMessage<HandlerDefinitions[MessageName][BusKind], MessageName> => {
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
        useMiddleware: useMiddleware,
        registerHandler,
        dispatch,
        createIntent,
    };
};
