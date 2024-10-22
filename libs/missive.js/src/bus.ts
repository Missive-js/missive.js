import { Schema as ZodSchema } from 'zod';
import { createEnvelope, Envelope } from './envelope.js';
import { Prettify, ReplaceKeys } from './utils.js';

type BusKinds = 'query' | 'command' | 'event';

type MessageRegistryType<BusKind extends BusKinds> = Record<string, HandlerDefinition<BusKind>>;
type CommandMessageRegistryType = Record<string, HandlerDefinition<'command'>>;
type QueryMessageRegistryType = Record<string, HandlerDefinition<'query'>>;
type EventMessageRegistryType = Record<string, HandlerDefinition<'event'>>;

type MessageRegistry<
    BusKind extends BusKinds,
    HandlerDefinitions extends MessageRegistryType<BusKind>,
> = HandlerDefinitions[keyof HandlerDefinitions][BusKind];

type TypedMessage<Message, MessageName extends string = string> = Message & { __type: MessageName };

export type Middleware<BusKind extends BusKinds, HandlerDefinitions extends MessageRegistryType<BusKind>> = (
    envelope: Envelope<MessageRegistry<BusKind, HandlerDefinitions>>,
    next: () => Promise<void>,
) => Promise<void>;

export type GenericMiddleware = Middleware<any, any>;

export type CommandMiddleware<HandlerDefinitions extends CommandMessageRegistryType> = Middleware<
    'command',
    HandlerDefinitions
>;
export type QueryMiddleware<HandlerDefinitions extends QueryMessageRegistryType> = Middleware<
    'query',
    HandlerDefinitions
>;
export type EventMiddleware<HandlerDefinitions extends EventMessageRegistryType> = Middleware<
    'event',
    HandlerDefinitions
>;

type MessageHandler<Intent, Result> = (envelope: Envelope<Intent>) => Promise<Result>;
type HandlerDefinition<BusKind extends BusKinds, Intent = object, Result = object> = {
    [key in BusKind]: Intent;
} & {
    result: Result;
};

export type CommandHandlerDefinition<Name extends string, Command = object, Result = object> = {
    [key in Name]: {
        command: Command;
        result: Result;
    };
};
export type QueryHandlerDefinition<Name extends string, Query = object, Result = object> = {
    [key in Name]: {
        query: Query;
        result: Result;
    };
};
export type EventHandlerDefinition<Name extends string, Event = object, Result = object> = {
    [key in Name]: {
        event: Event;
        result: Result;
    };
};

type ExtractedMessage<
    BusKind extends BusKinds,
    HandlerDefinitions extends MessageRegistryType<BusKind>,
    MessageName extends keyof HandlerDefinitions & string,
> = TypedMessage<HandlerDefinitions[MessageName][BusKind], MessageName>;

type MissiveBus<BusKind extends BusKinds, HandlerDefinitions extends MessageRegistryType<BusKind>> = {
    use: (middleware: Middleware<BusKind, HandlerDefinitions>) => void;
    register: <MessageName extends keyof HandlerDefinitions & string>(
        type: MessageName,
        schema: ZodSchema<HandlerDefinitions[MessageName][BusKind]>,
        handler: MessageHandler<HandlerDefinitions[MessageName][BusKind], HandlerDefinitions[MessageName]['result']>,
    ) => void;
    dispatch: <MessageName extends keyof HandlerDefinitions & string>(
        intent: TypedMessage<HandlerDefinitions[MessageName][BusKind], MessageName>,
    ) => Promise<{
        envelope: Envelope<HandlerDefinitions[MessageName][BusKind]>;
        result: HandlerDefinitions[MessageName]['result'] | undefined;
    }>;
    createIntent: <MessageName extends keyof HandlerDefinitions & string>(
        type: MessageName,
        intent: HandlerDefinitions[MessageName][BusKind],
    ) => TypedMessage<HandlerDefinitions[MessageName][BusKind], MessageName>;
};

type CommandBus<HandlerDefinitions extends CommandMessageRegistryType> = ReplaceKeys<
    MissiveBus<'command', HandlerDefinitions>,
    { createCommand: 'createIntent'; }
>;
export type MissiveCommandBus<HandlerDefinitions extends CommandMessageRegistryType> = Prettify<
    CommandBus<HandlerDefinitions>
>;

type QueryBus<HandlerDefinitions extends QueryMessageRegistryType> = ReplaceKeys<
    MissiveBus<'query', HandlerDefinitions>,
    { createQuery: 'createIntent' }
>;
export type MissiveQueryBus<HandlerDefinitions extends QueryMessageRegistryType> = Prettify<
    QueryBus<HandlerDefinitions>
>;

type EventBus<HandlerDefinitions extends EventMessageRegistryType> = ReplaceKeys<
    MissiveBus<'event', HandlerDefinitions>,
    { createEvent: 'createIntent' }
>;
export type MissiveEventBus<HandlerDefinitions extends EventMessageRegistryType> = Prettify<
    EventBus<HandlerDefinitions>
>;

type HandlerConfig<
    BusKind extends BusKinds,
    HandlerDefinitions extends MessageRegistryType<BusKind>,
    MessageName extends keyof HandlerDefinitions & string = keyof HandlerDefinitions & string,
> = HandlerDefinitions[MessageName] extends infer Definitions
    ? Definitions extends Record<string, unknown>
        ? {
              messageName: MessageName;
              schema: ZodSchema<Definitions[BusKind]>;
              handler: MessageHandler<Definitions[BusKind], Definitions['result']>;
          }
        : never
    : never;

const createBus = <BusKind extends BusKinds, HandlerDefinitions extends MessageRegistryType<BusKind>>(args?: {
    middlewares?: Middleware<BusKind, HandlerDefinitions>[];
    handlers?: HandlerConfig<BusKind, HandlerDefinitions>[];
}): MissiveBus<BusKind, HandlerDefinitions> => {
    const middlewares: Middleware<BusKind, HandlerDefinitions>[] = args?.middlewares || [];

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

    if (args?.handlers) {
        for (const { messageName, schema, handler } of args.handlers) {
            registerHandler(messageName as keyof HandlerDefinitions & string, schema, handler);
        }
    }

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
        message: ExtractedMessage<BusKind, HandlerDefinitions, MessageName>,
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
    ): ExtractedMessage<BusKind, HandlerDefinitions, MessageName> => {
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
        use: useMiddleware,
        register: registerHandler,
        dispatch,
        createIntent,
    };
};

export const createCommandBus = <HandlerDefinitions extends CommandMessageRegistryType>(args?: {
    middlewares?: CommandMiddleware<HandlerDefinitions>[];
    handlers?: HandlerConfig<'command', HandlerDefinitions>[];
}): MissiveCommandBus<HandlerDefinitions> => {
    const commandBus = createBus<'command', HandlerDefinitions>(args);

    return {
        use: commandBus.use,
        register: commandBus.register,
        dispatch: commandBus.dispatch,
        createCommand: commandBus.createIntent,
    };
};

export const createQueryBus = <HandlerDefinitions extends QueryMessageRegistryType>(args?: {
    middlewares?: QueryMiddleware<HandlerDefinitions>[];
    handlers?: HandlerConfig<'query', HandlerDefinitions>[];
}): MissiveQueryBus<HandlerDefinitions> => {
    const queryBus = createBus<'query', HandlerDefinitions>(args);

    return {
        use: queryBus.use,
        register: queryBus.register,
        dispatch: queryBus.dispatch,
        createQuery: queryBus.createIntent,
    };
};

export const createEventBus = <HandlerDefinitions extends EventMessageRegistryType>(args?: {
    middlewares?: EventMiddleware<HandlerDefinitions>[];
    handlers?: HandlerConfig<'event', HandlerDefinitions>[];
}): MissiveEventBus<HandlerDefinitions> => {
    const eventBus = createBus<'event', HandlerDefinitions>(args);

    return {
        use: eventBus.use,
        register: eventBus.register,
        dispatch: eventBus.dispatch,
        createEvent: eventBus.createIntent,
    };
};
