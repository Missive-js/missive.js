import { CreateUserHandlerDefinition } from '../use-cases/create-user.js';
import { UserCreatedHandlerDefinition } from '../use-cases/user-created.js';
import { GetUserHandlerDefinition } from '../use-cases/get-user.js';
import { RemoveUserHandlerDefinition } from '../use-cases/remove-user.js';
import { MissiveBus } from 'missive.js';
import { UserRemovedHandlerDefinition } from '../use-cases/user-removed.js';

export type QueryDefitions = GetUserHandlerDefinition;
export type QueryBus = MissiveBus<'query', QueryDefitions>;

export type CommandDefitions = CreateUserHandlerDefinition & RemoveUserHandlerDefinition;
export type CommandBus = MissiveBus<'command', CommandDefitions>;

export type EventDefitions = UserCreatedHandlerDefinition & UserRemovedHandlerDefinition;
export type EventBus = MissiveBus<'event', EventDefitions>;

// Events
export type UserCreatedEventStamp = {
    _type: keyof UserCreatedHandlerDefinition;
    userId: string;
};

export type UserRemovedEventStamp = {
    _type: keyof UserRemovedHandlerDefinition;
    userId: string;
};
