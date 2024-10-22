import { createCommandBus, createEventBus, createQueryBus } from 'missive.js';
import { CommandHandlerRegistry, EventHandlerRegistry, QueryHandlerRegistry } from '../domain/contracts/bus.js';
import { createEventsMiddleware } from '../domain/middlewares/events.js';
import { createLoggerMiddleware } from '../domain/middlewares/logger.js';
import { createCreateUserHandler, createUserCommandSchema } from '../domain/use-cases/create-user.js';
import { createGetUserHandler, getUserQuerySchema } from '../domain/use-cases/get-user.js';
import { createRemoveUserHandler, removeUserCommandSchema } from '../domain/use-cases/remove-user.js';
import { createUserCreatedHandler, userCreatedEventSchema } from '../domain/use-cases/user-created.js';
import { createUserCreatedHandler2 } from '../domain/use-cases/user-created2.js';
import { createUserRemovedHandler, userRemovedEventSchema } from '../domain/use-cases/user-removed.js';

const loggerMiddleware = createLoggerMiddleware();

const queryBus = createQueryBus<QueryHandlerRegistry>();
queryBus.use(loggerMiddleware);
queryBus.register('getUser', getUserQuerySchema, createGetUserHandler({}));

const eventBus = createEventBus<EventHandlerRegistry>();
eventBus.use(loggerMiddleware);
eventBus.register('userCreated', userCreatedEventSchema, createUserCreatedHandler({}));
eventBus.register('userCreated', userCreatedEventSchema, createUserCreatedHandler2({}));
eventBus.register('userRemoved', userRemovedEventSchema, createUserRemovedHandler({}));

const commandBus = createCommandBus<CommandHandlerRegistry>({
    middlewares: [loggerMiddleware, createEventsMiddleware(eventBus)],
    handlers: [
        { messageName: 'createUser', schema: createUserCommandSchema, handler: createCreateUserHandler({}) },
        { messageName: 'removeUser', schema: removeUserCommandSchema, handler: createRemoveUserHandler({}) },
    ],
});

export { queryBus, commandBus, eventBus };
