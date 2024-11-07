import { z } from 'zod';
import { UserCreatedEventStamp } from '../contracts/bus.js';
import { CommandHandlerDefinition, Envelope } from 'missive.js';

type Deps = {};

export const createUserCommandSchema = z.object({
    firstname: z.string(),
    lastname: z.string(),
    email: z.string().email(),
});
type Command = z.infer<typeof createUserCommandSchema>;
type Result = Awaited<ReturnType<typeof handler>>;
export type CreateUserHandlerDefinition = CommandHandlerDefinition<'createUser', Command, Result>;

export const createUserCommandOutputSchema = z.object({
    userId: z.string(),
    success: z.boolean(),
});

const handler = async (envelope: Envelope<Command>, deps: Deps) => {
    const { firstname, lastname, email } = envelope.message;

    // do something with the input
    console.log(`Create User Handler: Creating user ${firstname} ${lastname} with email ${email}...`);
    const userId = '1234';
    envelope.addStamp<UserCreatedEventStamp>('event', { _type: 'userCreated', userId });
    return {
        userId,
        success: true,
    };
};
export const createCreateUserHandler = (deps: Deps) => (command: Envelope<Command>) => handler(command, deps);
