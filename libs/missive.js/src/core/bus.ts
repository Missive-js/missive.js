import { createEnvelope, HandledStamp, IdentityStamp, ReprocessedStamp, type Envelope } from './envelope.js';
import type { Prettify, ReplaceKeys } from '../utils/types.js';
import type { Middleware } from './middleware.js';
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
        handler: MessageHandler<
            HandlerDefinitions[NoInfer<MessageName>][BusKind],
            HandlerDefinitions[NoInfer<MessageName>]['result']
        >,
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
        intent: HandlerDefinitions[NoInfer<MessageName>][BusKind],
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

type CreateBusOptions = {
    randomUUID?: () => Promise<string>;
};
const createBus = <BusKind extends BusKinds, HandlerDefinitions extends MessageRegistryType<BusKind>>(args?: {
    middlewares?: Middleware<BusKind, HandlerDefinitions>[];
    handlers?: HandlerConfig<BusKind, HandlerDefinitions>[];
    options?: CreateBusOptions;
}): MissiveBus<BusKind, HandlerDefinitions> => {
    const randomUUID = args?.options?.randomUUID ?? (async () => crypto.randomUUID());

    const middlewares: Middleware<BusKind, HandlerDefinitions>[] = args?.middlewares ?? [];

    type Handler<MessageName extends keyof HandlerDefinitions & string> = MessageHandler<
        HandlerDefinitions[MessageName][BusKind],
        HandlerDefinitions[MessageName]['result']
    >;
    const registry: { [MessageName in keyof HandlerDefinitions & string]?: Handler<MessageName>[] } = {};

    const useMiddleware = (middleware: Middleware<BusKind, HandlerDefinitions>) => {
        middlewares.push(middleware);
    };

    const registerHandler = <MessageName extends keyof HandlerDefinitions & string>(
        messageName: MessageName,
        handler: Handler<NoInfer<MessageName>>,
    ) => {
        (registry[messageName] ??= []).push(handler);
    };

    for (const { messageName, handler } of args?.handlers ?? []) {
        registerHandler(messageName as keyof HandlerDefinitions & string, handler);
    }

    const runChain = async <MessageName extends keyof HandlerDefinitions & string>(
        envelope: Envelope<HandlerDefinitions[MessageName][BusKind]>,
        handlers: Handler<MessageName>[],
    ) => {
        type Result = HandlerDefinitions[MessageName]['result'];
        // Each middleware gets a `next` bound to its own position, so a middleware that calls
        // next() more than once (e.g. the retryer) re-runs the rest of the chain from its position,
        // instead of sharing a single advancing cursor that would skip the downstream middlewares.
        const invoke = async (index: number): Promise<void> => {
            if (index < middlewares.length) {
                const middleware = middlewares[index];
                // we give the __type to the middleware only
                await middleware(
                    envelope as Envelope<TypedMessage<HandlerDefinitions[MessageName][BusKind], MessageName>>,
                    () => invoke(index + 1),
                );
                return;
            }
            // skip the handlers if a previous middleware (e.g. cache) already produced a result
            if (envelope.stampsOfType<HandledStamp<Result>>('missive:handled').length > 0) {
                return;
            }
            const results = await Promise.all(handlers.map((handler) => handler(envelope)));
            for (const result of results) {
                envelope.addStamp<HandledStamp<Result>>('missive:handled', result);
            }
        };
        await invoke(0);
    };

    const isEnvelope = <MessageName extends keyof HandlerDefinitions & string>(
        payload:
            | ExtractedMessage<BusKind, HandlerDefinitions, MessageName>
            | Envelope<ExtractedMessage<BusKind, HandlerDefinitions, MessageName>>,
    ): payload is Envelope<ExtractedMessage<BusKind, HandlerDefinitions, MessageName>> =>
        !!payload && 'stamps' in payload && 'message' in payload;

    const buildEnvelope = async <MessageName extends keyof HandlerDefinitions & string>(
        payload:
            | ExtractedMessage<BusKind, HandlerDefinitions, MessageName>
            | Envelope<ExtractedMessage<BusKind, HandlerDefinitions, MessageName>>,
    ): Promise<Envelope<HandlerDefinitions[MessageName][BusKind]>> => {
        if (!isEnvelope(payload)) {
            const envelope = createEnvelope(payload);
            envelope.addStamp<IdentityStamp>('missive:identity', { id: await randomUUID() });
            return envelope;
        }
        // re-dispatch: keep the original identity, preserve the prior stamps under a reprocessed stamp
        const identity = payload.firstStamp<IdentityStamp>('missive:identity');
        const previousStamps = payload.stamps.filter((stamp) => stamp.type !== 'missive:identity');
        const envelope = createEnvelope(payload.message);
        envelope.addStamp<IdentityStamp>('missive:identity', { id: identity?.body?.id || (await randomUUID()) });
        envelope.addStamp<ReprocessedStamp>('missive:reprocessed', { stamps: previousStamps });
        return envelope;
    };

    const dispatch = async <MessageName extends keyof HandlerDefinitions & string>(
        payload:
            | ExtractedMessage<BusKind, HandlerDefinitions, MessageName>
            | Envelope<ExtractedMessage<BusKind, HandlerDefinitions, MessageName>>,
    ): Promise<{
        envelope: Envelope<HandlerDefinitions[MessageName][BusKind]>;
        result: HandlerDefinitions[MessageName]['result'] | undefined;
        results: (HandlerDefinitions[MessageName]['result'] | undefined)[];
    }> => {
        type Result = HandlerDefinitions[MessageName]['result'];
        const type = isEnvelope(payload) ? payload.message.__type : payload.__type;
        const handlers = registry[type];
        if (!handlers) {
            throw new Error(`No handler found for type: ${type}`);
        }
        const envelope = await buildEnvelope<MessageName>(payload);
        await runChain<MessageName>(envelope, handlers as Handler<MessageName>[]);
        const handledStamps = envelope.stampsOfType<HandledStamp<Result>>('missive:handled');
        return {
            envelope,
            result: handledStamps.at(-1)?.body,
            results: handledStamps.map((r) => r?.body),
        };
    };

    const createIntent = <MessageName extends keyof HandlerDefinitions & string>(
        type: MessageName,
        intent: HandlerDefinitions[NoInfer<MessageName>][BusKind],
    ): ExtractedMessage<BusKind, HandlerDefinitions, MessageName> => {
        if (!registry[type]) {
            throw new Error(`No handler found for type: ${type}`);
        }
        return { __type: type, ...intent };
    };

    return {
        use: useMiddleware,
        register: registerHandler,
        dispatch,
        createIntent,
    };
};

// Binds `bus.use(factory(...args))` so per-bus facades don't repeat the same shape per middleware.
const wrap =
    <P extends unknown[], M>(bus: { use: (m: M) => void }, factory: (...args: P) => M) =>
    (...args: P): void => {
        bus.use(factory(...args));
    };

export function createCommandBus<HandlerDefinitions extends CommandMessageRegistryType>(args?: {
    middlewares?: Middleware<'command', HandlerDefinitions>[];
    handlers?: HandlerConfig<'command', HandlerDefinitions>[];
    options?: CreateBusOptions;
}): MissiveCommandBus<HandlerDefinitions> {
    const commandBus = createBus<'command', HandlerDefinitions>(args);
    return {
        use: commandBus.use,
        useValidatorMiddleware: wrap(commandBus, createValidatorMiddleware<'command', HandlerDefinitions>),
        useLoggerMiddleware: wrap(commandBus, createLoggerMiddleware<'command', HandlerDefinitions>),
        useLockMiddleware: wrap(commandBus, createLockMiddleware<'command', HandlerDefinitions>),
        useRetryerMiddleware: wrap(commandBus, createRetryerMiddleware<'command', HandlerDefinitions>),
        useWebhookMiddleware: wrap(commandBus, createWebhookMiddleware<'command', HandlerDefinitions>),
        useFeatureFlagMiddleware: wrap(commandBus, createFeatureFlagMiddleware<'command', HandlerDefinitions>),
        useMockerMiddleware: wrap(commandBus, createMockerMiddleware<'command', HandlerDefinitions>),
        useAsyncMiddleware: wrap(commandBus, createAsyncMiddleware<'command', HandlerDefinitions>),
        register: commandBus.register,
        dispatch: commandBus.dispatch,
        createCommand: commandBus.createIntent,
    };
}

export function createQueryBus<HandlerDefinitions extends QueryMessageRegistryType>(args?: {
    middlewares?: Middleware<'query', HandlerDefinitions>[];
    handlers?: HandlerConfig<'query', HandlerDefinitions>[];
    options?: CreateBusOptions;
}): MissiveQueryBus<HandlerDefinitions> {
    const queryBus = createBus<'query', HandlerDefinitions>(args);
    const bus: MissiveQueryBus<HandlerDefinitions> = {
        use: queryBus.use,
        useValidatorMiddleware: wrap(queryBus, createValidatorMiddleware<'query', HandlerDefinitions>),
        useLoggerMiddleware: wrap(queryBus, createLoggerMiddleware<'query', HandlerDefinitions>),
        useLockMiddleware: wrap(queryBus, createLockMiddleware<'query', HandlerDefinitions>),
        useRetryerMiddleware: wrap(queryBus, createRetryerMiddleware<'query', HandlerDefinitions>),
        useWebhookMiddleware: wrap(queryBus, createWebhookMiddleware<'query', HandlerDefinitions>),
        useFeatureFlagMiddleware: wrap(queryBus, createFeatureFlagMiddleware<'query', HandlerDefinitions>),
        useMockerMiddleware: wrap(queryBus, createMockerMiddleware<'query', HandlerDefinitions>),
        // cacher needs the bus reference for stale-while-revalidate, so it can't go through `wrap` directly
        useCacherMiddleware: (...props: Parameters<typeof createCacherMiddleware<HandlerDefinitions>>) => {
            queryBus.use(createCacherMiddleware({ ...props[0], bus }));
        },
        register: queryBus.register,
        dispatch: queryBus.dispatch,
        createQuery: queryBus.createIntent,
    };
    return bus;
}

export function createEventBus<HandlerDefinitions extends EventMessageRegistryType>(args?: {
    middlewares?: Middleware<'event', HandlerDefinitions>[];
    handlers?: HandlerConfig<'event', HandlerDefinitions>[];
    options?: CreateBusOptions;
}): MissiveEventBus<HandlerDefinitions> {
    const eventBus = createBus<'event', HandlerDefinitions>(args);
    return {
        use: eventBus.use,
        useValidatorMiddleware: wrap(eventBus, createValidatorMiddleware<'event', HandlerDefinitions>),
        useLoggerMiddleware: wrap(eventBus, createLoggerMiddleware<'event', HandlerDefinitions>),
        useLockMiddleware: wrap(eventBus, createLockMiddleware<'event', HandlerDefinitions>),
        useRetryerMiddleware: wrap(eventBus, createRetryerMiddleware<'event', HandlerDefinitions>),
        useWebhookMiddleware: wrap(eventBus, createWebhookMiddleware<'event', HandlerDefinitions>),
        useFeatureFlagMiddleware: wrap(eventBus, createFeatureFlagMiddleware<'event', HandlerDefinitions>),
        useMockerMiddleware: wrap(eventBus, createMockerMiddleware<'event', HandlerDefinitions>),
        useAsyncMiddleware: wrap(eventBus, createAsyncMiddleware<'event', HandlerDefinitions>),
        register: eventBus.register,
        dispatch: eventBus.dispatch,
        createEvent: eventBus.createIntent,
    };
}
