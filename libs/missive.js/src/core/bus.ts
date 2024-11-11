import { createEnvelope, HandledStamp, IdentityStamp, ReprocessedStamp, type Envelope } from './envelope.js';
import type { Prettify, ReplaceKeys } from '../utils/types.js';
import type { Middleware } from './middleware.js';
import { nanoid } from 'nanoid';
import { createLoggerMiddleware } from '../middlewares/logger-middleware.js';
import { createCacherMiddleware } from '../middlewares/cacher-middleware.js';
import { createRetryerMiddleware } from '../middlewares/retryer-middleware.js';
import { createWebhookMiddleware } from '../middlewares/webhook-middleware.js';
import { createLockMiddleware } from '../middlewares/lock-middleware.js';
import { createFeatureFlagMiddleware } from '../middlewares/feature-flag-middleware.js';
import { createMockerMiddleware } from '../middlewares/mocker-middleware.js';
import { createAsyncMiddleware } from '../middlewares/async-middleware.js';
import { createValidatorMiddleware } from '../middlewares/validator-middleware.js';

export type BusKinds = 'query' | 'command' | 'event';
export type MessageRegistryType<BusKind extends BusKinds> = Record<string, HandlerDefinition<BusKind>>;
export type CommandMessageRegistryType = Record<string, HandlerDefinition<'command'>>;
export type QueryMessageRegistryType = Record<string, HandlerDefinition<'query'>>;
export type EventMessageRegistryType = Record<string, HandlerDefinition<'event'>>;

export type MessageRegistry<
    BusKind extends BusKinds,
    HandlerDefinitions extends MessageRegistryType<BusKind>,
> = HandlerDefinitions[keyof HandlerDefinitions][BusKind];

export type TypedMessage<Message, MessageName extends string = string> = Message & { __type: MessageName };

type MessageHandler<Intent, Result> = (envelope: Envelope<Intent>) => Promise<Result>;
export type HandlerDefinition<BusKind extends BusKinds, Intent = object, Result = object | undefined | void | null> = {
    [key in BusKind]: Intent;
} & {
    result: Result;
};

export type CommandHandlerDefinition<
    Name extends string,
    Command = object,
    Result = object | undefined | void | null,
> = {
    [key in Name]: {
        command: Command;
        result: Result;
    };
};
export type QueryHandlerDefinition<Name extends string, Query = object, Result = object | undefined | void | null> = {
    [key in Name]: {
        query: Query;
        result: Result;
    };
};
export type EventHandlerDefinition<Name extends string, Event = object, Result = object | undefined | void | null> = {
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
        handler: MessageHandler<HandlerDefinitions[MessageName][BusKind], HandlerDefinitions[MessageName]['result']>,
    ) => void;
    dispatch: {
        <MessageName extends keyof HandlerDefinitions & string>(
            intent: TypedMessage<HandlerDefinitions[MessageName][BusKind], MessageName>,
        ): Promise<{
            envelope: Envelope<HandlerDefinitions[MessageName][BusKind]>;
            result: HandlerDefinitions[MessageName]['result'] | undefined;
            results: (HandlerDefinitions[MessageName]['result'] | undefined)[];
        }>;
        <MessageName extends keyof HandlerDefinitions & string>(
            envelope: Envelope<TypedMessage<HandlerDefinitions[MessageName][BusKind], MessageName>>,
        ): Promise<{
            envelope: Envelope<HandlerDefinitions[MessageName][BusKind]>;
            result: HandlerDefinitions[MessageName]['result'] | undefined;
            results: (HandlerDefinitions[MessageName]['result'] | undefined)[];
        }>;
    };
    createIntent: <MessageName extends keyof HandlerDefinitions & string>(
        type: MessageName,
        intent: HandlerDefinitions[MessageName][BusKind],
    ) => TypedMessage<HandlerDefinitions[MessageName][BusKind], MessageName>;
};

type MissiveCommandBus<HandlerDefinitions extends CommandMessageRegistryType> = ReplaceKeys<
    MissiveBus<'command', HandlerDefinitions>,
    { createCommand: 'createIntent' }
> & {
    useValidatorMiddleware: (
        ...props: Parameters<typeof createValidatorMiddleware<'command', HandlerDefinitions>>
    ) => void;
    useLoggerMiddleware: (...props: Parameters<typeof createLoggerMiddleware<'command', HandlerDefinitions>>) => void;
    useRetryerMiddleware: (...props: Parameters<typeof createRetryerMiddleware<'command', HandlerDefinitions>>) => void;
    useWebhookMiddleware: (...props: Parameters<typeof createWebhookMiddleware<'command', HandlerDefinitions>>) => void;
    useLockMiddleware: (...props: Parameters<typeof createLockMiddleware<'command', HandlerDefinitions>>) => void;
    useFeatureFlagMiddleware: (
        ...props: Parameters<typeof createFeatureFlagMiddleware<'command', HandlerDefinitions>>
    ) => void;
    useMockerMiddleware: (...props: Parameters<typeof createMockerMiddleware<'command', HandlerDefinitions>>) => void;
    useAsyncMiddleware: (...props: Parameters<typeof createAsyncMiddleware<'command', HandlerDefinitions>>) => void;
};

export type CommandBus<HandlerDefinitions extends CommandMessageRegistryType> = Prettify<
    MissiveCommandBus<HandlerDefinitions>
>;

type MissiveQueryBus<HandlerDefinitions extends QueryMessageRegistryType> = ReplaceKeys<
    MissiveBus<'query', HandlerDefinitions>,
    { createQuery: 'createIntent' }
> & {
    useValidatorMiddleware: (
        ...props: Parameters<typeof createValidatorMiddleware<'query', HandlerDefinitions>>
    ) => void;
    useLoggerMiddleware: (...props: Parameters<typeof createLoggerMiddleware<'query', HandlerDefinitions>>) => void;
    useRetryerMiddleware: (...props: Parameters<typeof createRetryerMiddleware<'query', HandlerDefinitions>>) => void;
    useWebhookMiddleware: (...props: Parameters<typeof createWebhookMiddleware<'query', HandlerDefinitions>>) => void;
    useLockMiddleware: (...props: Parameters<typeof createLockMiddleware<'query', HandlerDefinitions>>) => void;
    useCacherMiddleware: (...props: Parameters<typeof createCacherMiddleware<HandlerDefinitions>>) => void;
    useFeatureFlagMiddleware: (
        ...props: Parameters<typeof createFeatureFlagMiddleware<'query', HandlerDefinitions>>
    ) => void;
    useMockerMiddleware: (...props: Parameters<typeof createMockerMiddleware<'query', HandlerDefinitions>>) => void;
};
export type QueryBus<HandlerDefinitions extends QueryMessageRegistryType> = Prettify<
    MissiveQueryBus<HandlerDefinitions>
>;

type MissiveEventBus<HandlerDefinitions extends EventMessageRegistryType> = ReplaceKeys<
    MissiveBus<'event', HandlerDefinitions>,
    { createEvent: 'createIntent' }
> & {
    useValidatorMiddleware: (
        ...props: Parameters<typeof createValidatorMiddleware<'event', HandlerDefinitions>>
    ) => void;
    useLoggerMiddleware: (...props: Parameters<typeof createLoggerMiddleware<'event', HandlerDefinitions>>) => void;
    useRetryerMiddleware: (...props: Parameters<typeof createRetryerMiddleware<'event', HandlerDefinitions>>) => void;
    useWebhookMiddleware: (...props: Parameters<typeof createWebhookMiddleware<'event', HandlerDefinitions>>) => void;
    useLockMiddleware: (...props: Parameters<typeof createLockMiddleware<'event', HandlerDefinitions>>) => void;
    useFeatureFlagMiddleware: (
        ...props: Parameters<typeof createFeatureFlagMiddleware<'event', HandlerDefinitions>>
    ) => void;
    useMockerMiddleware: (...props: Parameters<typeof createMockerMiddleware<'event', HandlerDefinitions>>) => void;
    useAsyncMiddleware: (...props: Parameters<typeof createAsyncMiddleware<'event', HandlerDefinitions>>) => void;
};
export type EventBus<HandlerDefinitions extends EventMessageRegistryType> = Prettify<
    MissiveEventBus<HandlerDefinitions>
>;

type HandlerConfig<
    BusKind extends BusKinds,
    HandlerDefinitions extends MessageRegistryType<BusKind>,
    MessageName extends keyof HandlerDefinitions & string = keyof HandlerDefinitions & string,
> = HandlerDefinitions[MessageName] extends infer Definitions
    ? Definitions extends Record<string, unknown>
        ? {
              messageName: MessageName;
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
        handler: MessageHandler<HandlerDefinitions[MessageName][BusKind], HandlerDefinitions[MessageName]['result']>,
    ) => {
        if (!registry[messageName]) {
            registry[messageName] = { handlers: [] };
        }
        registry[messageName].handlers.push(handler);
    };

    if (args?.handlers) {
        for (const { messageName, handler } of args.handlers) {
            registerHandler(messageName as keyof HandlerDefinitions & string, handler);
        }
    }

    const createMiddlewareChain = <MessageName extends keyof HandlerDefinitions & string>(
        handlers: MessageHandler<HandlerDefinitions[MessageName][BusKind], HandlerDefinitions[MessageName]['result']>[],
    ) => {
        return async (envelope: Envelope<HandlerDefinitions[MessageName][BusKind]>) => {
            let index = 0;
            const next = async () => {
                if (index < middlewares.length) {
                    const middleware = middlewares[index++];
                    // we give the __type to the middleware only
                    await middleware(
                        envelope as Envelope<TypedMessage<HandlerDefinitions[MessageName][BusKind], MessageName>>,
                        next,
                    );
                } else {
                    // we do not run the handlers if the message has already been handled. by a previous middleware like cache
                    if (
                        envelope.stampsOfType<HandledStamp<HandlerDefinitions[MessageName]['result']>>(
                            'missive:handled',
                        ).length > 0
                    ) {
                        return;
                    }
                    const results = await Promise.all(handlers.map(async (handler) => await handler(envelope)));
                    results.forEach((result) =>
                        envelope.addStamp<HandledStamp<HandlerDefinitions[MessageName]['result']>>(
                            'missive:handled',
                            result,
                        ),
                    );
                }
            };
            await next();
        };
    };

    function isEnvelope<MessageName extends keyof HandlerDefinitions & string>(
        payload:
            | ExtractedMessage<BusKind, HandlerDefinitions, MessageName>
            | Envelope<ExtractedMessage<BusKind, HandlerDefinitions, MessageName>>,
    ): payload is Envelope<ExtractedMessage<BusKind, HandlerDefinitions, MessageName>> {
        return payload && 'stamps' in payload && 'message' in payload;
    }

    const dispatch = async <MessageName extends keyof HandlerDefinitions & string>(
        payload:
            | ExtractedMessage<BusKind, HandlerDefinitions, MessageName>
            | Envelope<ExtractedMessage<BusKind, HandlerDefinitions, MessageName>>,
    ): Promise<{
        envelope: Envelope<HandlerDefinitions[MessageName][BusKind]>;
        result: HandlerDefinitions[MessageName]['result'] | undefined;
        results: (HandlerDefinitions[MessageName]['result'] | undefined)[];
    }> => {
        const isEnveloped = isEnvelope(payload);
        const type = isEnveloped ? payload.message.__type : payload.__type;
        const entry = registry[type];
        if (!entry) {
            throw new Error(`No handler found for type: ${type}`);
        }
        const { handlers } = entry;
        const chain = createMiddlewareChain<MessageName>(handlers);
        // if we dispatch an envelope we do not need to create a new one and backup the original stamps
        // while keeping the identity stamp
        const envelope = (() => {
            if (!isEnveloped) {
                const envelope = createEnvelope(payload);
                envelope.addStamp<IdentityStamp>('missive:identity', { id: nanoid() });
                return envelope;
            }
            const identity = payload.firstStamp<IdentityStamp>('missive:identity');
            const stamps = payload.stamps.filter((stamp) => stamp.type !== 'missive:identity');
            const envelope = createEnvelope(payload.message);
            envelope.addStamp<IdentityStamp>('missive:identity', { id: identity?.body?.id || nanoid() });
            envelope.addStamp<ReprocessedStamp>('missive:reprocessed', {
                stamps,
            });
            return envelope;
        })();
        await chain(envelope);
        return {
            envelope,
            result: envelope.lastStamp<HandledStamp<HandlerDefinitions[MessageName]['result']>>('missive:handled')
                ?.body,
            results:
                envelope
                    .stampsOfType<HandledStamp<HandlerDefinitions[MessageName]['result']>>('missive:handled')
                    .map((r) => r?.body) || [],
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

        return {
            __type: type,
            ...intent,
        };
    };
    return {
        use: useMiddleware,
        register: registerHandler,
        dispatch,
        createIntent,
    };
};

export function createCommandBus<HandlerDefinitions extends CommandMessageRegistryType>(args?: {
    middlewares?: Middleware<'command', HandlerDefinitions>[];
    handlers?: HandlerConfig<'command', HandlerDefinitions>[];
}): MissiveCommandBus<HandlerDefinitions> {
    const commandBus = createBus<'command', HandlerDefinitions>(args);

    return {
        use: (middleware: Middleware<'command', HandlerDefinitions>) => commandBus.use(middleware),
        useValidatorMiddleware: (
            ...props: Parameters<typeof createValidatorMiddleware<'command', HandlerDefinitions>>
        ) => {
            commandBus.use(createValidatorMiddleware(...props));
        },
        useLoggerMiddleware: (...props: Parameters<typeof createLoggerMiddleware<'command', HandlerDefinitions>>) => {
            commandBus.use(createLoggerMiddleware(...props));
        },
        useLockMiddleware: (...props: Parameters<typeof createLockMiddleware<'command', HandlerDefinitions>>) => {
            commandBus.use(createLockMiddleware(...props));
        },
        useRetryerMiddleware: (...props: Parameters<typeof createRetryerMiddleware<'command', HandlerDefinitions>>) => {
            commandBus.use(createRetryerMiddleware(...props));
        },
        useWebhookMiddleware: (...props: Parameters<typeof createWebhookMiddleware<'command', HandlerDefinitions>>) => {
            commandBus.use(createWebhookMiddleware(...props));
        },
        useFeatureFlagMiddleware: (
            ...props: Parameters<typeof createFeatureFlagMiddleware<'command', HandlerDefinitions>>
        ) => {
            commandBus.use(createFeatureFlagMiddleware(...props));
        },
        useMockerMiddleware: (...props: Parameters<typeof createMockerMiddleware<'command', HandlerDefinitions>>) => {
            commandBus.use(createMockerMiddleware(...props));
        },
        useAsyncMiddleware: (...props: Parameters<typeof createAsyncMiddleware<'command', HandlerDefinitions>>) => {
            commandBus.use(createAsyncMiddleware(...props));
        },
        register: commandBus.register,
        dispatch: commandBus.dispatch,
        createCommand: commandBus.createIntent,
    };
}

export function createQueryBus<HandlerDefinitions extends QueryMessageRegistryType>(args?: {
    middlewares?: Middleware<'query', HandlerDefinitions>[];
    handlers?: HandlerConfig<'query', HandlerDefinitions>[];
}): MissiveQueryBus<HandlerDefinitions> {
    const queryBus = createBus<'query', HandlerDefinitions>(args);

    return {
        use: (middleware: Middleware<'query', HandlerDefinitions>) => queryBus.use(middleware),
        useValidatorMiddleware: (
            ...props: Parameters<typeof createValidatorMiddleware<'query', HandlerDefinitions>>
        ) => {
            queryBus.use(createValidatorMiddleware(...props));
        },
        useLoggerMiddleware: (...props: Parameters<typeof createLoggerMiddleware<'query', HandlerDefinitions>>) => {
            queryBus.use(createLoggerMiddleware(...props));
        },
        useLockMiddleware: (...props: Parameters<typeof createLockMiddleware<'query', HandlerDefinitions>>) => {
            queryBus.use(createLockMiddleware(...props));
        },
        useRetryerMiddleware: (...props: Parameters<typeof createRetryerMiddleware<'query', HandlerDefinitions>>) => {
            queryBus.use(createRetryerMiddleware(...props));
        },
        useWebhookMiddleware: (...props: Parameters<typeof createWebhookMiddleware<'query', HandlerDefinitions>>) => {
            queryBus.use(createWebhookMiddleware(...props));
        },
        useCacherMiddleware: (...props: Parameters<typeof createCacherMiddleware<HandlerDefinitions>>) => {
            queryBus.use(createCacherMiddleware(...props));
        },
        useFeatureFlagMiddleware: (
            ...props: Parameters<typeof createFeatureFlagMiddleware<'query', HandlerDefinitions>>
        ) => {
            queryBus.use(createFeatureFlagMiddleware(...props));
        },
        useMockerMiddleware: (...props: Parameters<typeof createMockerMiddleware<'query', HandlerDefinitions>>) => {
            queryBus.use(createMockerMiddleware(...props));
        },
        register: queryBus.register,
        dispatch: queryBus.dispatch,
        createQuery: queryBus.createIntent,
    };
}

export function createEventBus<HandlerDefinitions extends EventMessageRegistryType>(args?: {
    middlewares?: Middleware<'event', HandlerDefinitions>[];
    handlers?: HandlerConfig<'event', HandlerDefinitions>[];
}): MissiveEventBus<HandlerDefinitions> {
    const eventBus = createBus<'event', HandlerDefinitions>(args);
    return {
        use: (middleware: Middleware<'event', HandlerDefinitions>) => eventBus.use(middleware),
        useValidatorMiddleware: (
            ...props: Parameters<typeof createValidatorMiddleware<'event', HandlerDefinitions>>
        ) => {
            eventBus.use(createValidatorMiddleware(...props));
        },
        useLoggerMiddleware: (...props: Parameters<typeof createLoggerMiddleware<'event', HandlerDefinitions>>) => {
            eventBus.use(createLoggerMiddleware(...props));
        },
        useLockMiddleware: (...props: Parameters<typeof createLockMiddleware<'event', HandlerDefinitions>>) => {
            eventBus.use(createLockMiddleware(...props));
        },
        useRetryerMiddleware: (...props: Parameters<typeof createRetryerMiddleware<'event', HandlerDefinitions>>) => {
            eventBus.use(createRetryerMiddleware(...props));
        },
        useWebhookMiddleware: (...props: Parameters<typeof createWebhookMiddleware<'event', HandlerDefinitions>>) => {
            eventBus.use(createWebhookMiddleware(...props));
        },
        useFeatureFlagMiddleware: (
            ...props: Parameters<typeof createFeatureFlagMiddleware<'event', HandlerDefinitions>>
        ) => {
            eventBus.use(createFeatureFlagMiddleware(...props));
        },
        useMockerMiddleware: (...props: Parameters<typeof createMockerMiddleware<'event', HandlerDefinitions>>) => {
            eventBus.use(createMockerMiddleware(...props));
        },
        useAsyncMiddleware: (...props: Parameters<typeof createAsyncMiddleware<'event', HandlerDefinitions>>) => {
            eventBus.use(createAsyncMiddleware(...props));
        },
        register: eventBus.register,
        dispatch: eventBus.dispatch,
        createEvent: eventBus.createIntent,
    };
}
