import { Envelope } from 'missive.js';
import { z } from 'zod';
import { UserRemovedEventStamp } from '../contracts/bus.js';

type Deps = {};

const removeUserCommandType = 'removeUser' as const;
export const removeUserCommandSchema = z.object({
    userId: z.string(),
});
type Command = z.infer<typeof removeUserCommandSchema>;
type Result = Awaited<ReturnType<typeof handler>>;
export type RemoveUserHandlerDefinition = {
    [removeUserCommandType]: {
        command: Command;
        result: Result;
    };
};

const handler = async (envelope: Envelope<Command>, deps: Deps) => {
    const { userId } = envelope.message;
    console.log(`Remove User Handler: Removing user with id ${userId}`);
    envelope.addStamp<UserRemovedEventStamp>('event', { _type: 'userRemoved', userId });
    return {
        success: true,
        removeCount: 1,
    };
};
export const createRemoveUserHandler = (deps: Deps) => (command: Envelope<Command>) => handler(command, deps);
