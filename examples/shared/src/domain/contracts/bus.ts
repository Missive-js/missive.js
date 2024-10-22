import { CreateUserHandlerDefinition } from '../use-cases/create-user.js';
import { UserCreatedHandlerDefinition } from '../use-cases/user-created.js';
import { GetUserHandlerDefinition } from '../use-cases/get-user.js';
import { RemoveUserHandlerDefinition } from '../use-cases/remove-user.js';
import { MissiveQueryBus, MissiveCommandBus, MissiveEventBus } from 'missive.js';
import { UserRemovedHandlerDefinition } from '../use-cases/user-removed.js';

export type QueryHandlerRegistry = GetUserHandlerDefinition;
export type QueryBus = MissiveQueryBus<QueryHandlerRegistry>;

export type CommandHandlerRegistry = CreateUserHandlerDefinition & RemoveUserHandlerDefinition;
export type CommandBus = MissiveCommandBus<CommandHandlerRegistry>;

export type EventHandlerRegistry = UserCreatedHandlerDefinition & UserRemovedHandlerDefinition;
export type EventBus = MissiveEventBus<EventHandlerRegistry>;

// Events
export type UserCreatedEventStamp = {
    _type: keyof UserCreatedHandlerDefinition;
    userId: string;
};

export type UserRemovedEventStamp = {
    _type: keyof UserRemovedHandlerDefinition;
    userId: string;
};
