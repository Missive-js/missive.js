import { Envelope } from 'missive.js';
import { z } from 'zod';

type Deps = {};

export const userCreatedEventType = 'userCreated' as const;
export const userCreatedEventSchema = z.object({
    userId: z.string(),
});
export type Event = z.infer<typeof userCreatedEventSchema>;
type Result = Awaited<ReturnType<typeof handler>>;
export type UserCreatedHandlerDefinition = {
    [userCreatedEventType]: {
        event: Event;
        result: Result;
    };
};

const handler = async (envelope: Envelope<Event>, deps: Deps) => {
    const { userId } = envelope.message;
    console.log(`User Created Event Handler: User Created ${userId}`);
    return {
        success: true,
    };
};
export const createUserCreatedHandler = (deps: Deps) => (event: Envelope<Event>) => handler(event, deps);
