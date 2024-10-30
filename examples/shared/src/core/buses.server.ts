import { createCommandBus, createEventBus, createQueryBus, createWebhookMiddleware } from 'missive.js';
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
queryBus.useLoggerMiddleware();
queryBus.useCacherMiddleware();
queryBus.use(loggerMiddleware);
queryBus.register('getUser', getUserQuerySchema, createGetUserHandler({}));
queryBus.register('getOrders', getOrdersQuerySchema, createGetOrdersHandler({}));

const eventBus: EventBus = createEventBus<EventHandlerRegistry>();
eventBus.useLoggerMiddleware({
    intents: {
        userCreated: {
            async: true,
        },
    },
});
eventBus.use(loggerMiddleware);
eventBus.register('userCreated', userCreatedEventSchema, createUserCreatedHandler({}));
eventBus.register('userCreated', userCreatedEventSchema, createUserCreatedHandler2({}));
eventBus.register('userRemoved', userRemovedEventSchema, createUserRemovedHandler({}));

const commandBus: CommandBus = createCommandBus<CommandHandlerRegistry>({
    middlewares: [loggerMiddleware, createEventsMiddleware(eventBus)],
    handlers: [
        { messageName: 'createUser', schema: createUserCommandSchema, handler: createCreateUserHandler({}) },
        { messageName: 'removeUser', schema: removeUserCommandSchema, handler: createRemoveUserHandler({}) },
    ],
});
commandBus.useLoggerMiddleware();
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
