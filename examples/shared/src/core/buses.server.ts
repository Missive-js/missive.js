import { createCommandBus, createEventBus, createQueryBus } from 'missive.js';
import {
    CommandBus,
    CommandHandlerRegistry,
    EventBus,
    EventHandlerRegistry,
    QueryHandlerRegistry,
} from '../domain/contracts/bus.js';
import { createEventsMiddleware } from '../domain/middlewares/events.js';
import { createLoggerMiddleware } from '../domain/middlewares/logger.js';
import { createCreateUserHandler, createUserCommandSchema } from '../domain/use-cases/create-user.js';
import { createGetUserHandler, getUserQuerySchema } from '../domain/use-cases/get-user.js';
import { createRemoveUserHandler, removeUserCommandSchema } from '../domain/use-cases/remove-user.js';
import { createUserCreatedHandler, userCreatedEventSchema } from '../domain/use-cases/user-created.js';
import { createUserCreatedHandler2 } from '../domain/use-cases/user-created2.js';
import { createUserRemovedHandler, userRemovedEventSchema } from '../domain/use-cases/user-removed.js';
import { QueryBus } from '../domain/contracts/bus.js';
import { createGetOrdersHandler, getOrdersQuerySchema } from '../domain/use-cases/get-orders.js';

// Project Logger Middleware Adapter
const loggerMiddleware = createLoggerMiddleware();

const queryBus: QueryBus = createQueryBus<QueryHandlerRegistry>();
queryBus.useValidatorMiddleware({
    getUser: (message) => getUserQuerySchema.safeParse(message).success,
    getOrders: (message) => getOrdersQuerySchema.safeParse(message).success,
});
queryBus.useLoggerMiddleware();
queryBus.useCacherMiddleware();
queryBus.use(loggerMiddleware);

queryBus.useFeatureFlagMiddleware({
    featureFlagChecker: async (intent) => {
        if (intent === 'getUser') {
            return Math.random() > 0.5;
        }
        return true;
    },
    intents: {
        getUser: {
            fallbackHandler: async (envelope) => {
                return {
                    success: false,
                    nickname: '1234',
                    user: {
                        id: '1234',
                        email: 'asd',
                    },
                };
            },
            shortCircuit: false,
        },
        getOrders: {
            fallbackHandler: async (envelope) => {
                return {
                    success: false,
                    orders: [],
                    user: {
                        id: '1234',
                        email: 'asd',
                    },
                };
            },
        },
    },
});
queryBus.register('getUser', createGetUserHandler({}));
queryBus.register('getOrders', createGetOrdersHandler({}));

const eventBus: EventBus = createEventBus<EventHandlerRegistry>();
eventBus.useValidatorMiddleware({
    userCreated: (message) => createUserCommandSchema.safeParse(message).success,
    userRemoved: (message) => removeUserCommandSchema.safeParse(message).success,
});
eventBus.useLoggerMiddleware({
    intents: {
        userCreated: {
            async: true,
        },
    },
});
eventBus.use(loggerMiddleware);
eventBus.register('userCreated', createUserCreatedHandler({}));
eventBus.register('userCreated', createUserCreatedHandler2({}));
eventBus.register('userRemoved', createUserRemovedHandler({}));

const commandBus: CommandBus = createCommandBus<CommandHandlerRegistry>({
    middlewares: [loggerMiddleware, createEventsMiddleware(eventBus)],
    handlers: [
        { messageName: 'createUser', handler: createCreateUserHandler({}) },
        { messageName: 'removeUser', handler: createRemoveUserHandler({}) },
    ],
});
commandBus.useValidatorMiddleware({
    createUser: (message) => createUserCommandSchema.safeParse(message).success,
    removeUser: (message) => removeUserCommandSchema.safeParse(message).success,
});
// commandBus.useMockerMiddleware({
//     intents: {
//         createUser: async (envelope) => ({
//             success: true,
//             userId: '1234',
//         }),
//         removeUser: async (envelope) => {
//             return {
//                 success: true,
//                 removeCount: 42,
//             };
//         },
//     },
// });
commandBus.useLockMiddleware({
    adapter: {
        acquire: async () => true,
        release: async () => undefined,
    },
    timeout: 1000,
    getLockKey: async (envelope) => envelope.message.__type,
    intents: {
        createUser: {
            getLockKey: async (envelope) => envelope.message.email,
            timeout: 2000,
            ttl: 500,
            tick: 100,
        },
    },
});

commandBus.useAsyncMiddleware({
    consume: false,
    produce: async (envelope) => {
        console.log('Generic Push to Queue', envelope);
    },
    async: false,
    intents: {
        createUser: {
            async: true,
            produce: async (envelope) => {
                console.log('createUser Push to Queue', envelope);
            },
        },
    },
});

commandBus.useWebhookMiddleware({
    async: true,
    parallel: true,
    maxAttempts: 3,
    jitter: 0.5,
    multiplier: 1.5,
    waitingAlgorithm: 'exponential',
    fetcher: fetch,
    intents: {
        createUser: {
            async: false,
            parallel: false,
            jitter: 0.25,
            endpoints: [
                {
                    url: 'https://webhook.site/c351ab7a-c4cc-4270-9872-48a2d4f67ea4',
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    signatureHeader: 'X-Plop-Signature',
                    signature: (payload) => 'signature',
                },
            ],
        },
    },
});

export { queryBus, commandBus, eventBus };
