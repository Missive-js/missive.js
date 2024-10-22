import { Envelope, EventHandlerDefinition } from 'missive.js';
import { z } from 'zod';

type Deps = {};

export const userRemovedEventSchema = z.object({
    userId: z.string(),
});
type Event = z.infer<typeof userRemovedEventSchema>;
type Result = Awaited<ReturnType<typeof handler>>;
export type UserRemovedHandlerDefinition = EventHandlerDefinition<'userRemoved', Event, Result>;

const handler = async (envelope: Envelope<Event>, deps: Deps) => {
    const { userId } = envelope.message;
    console.log(`User Removed Event Handler: User Removed ${userId}`);
    return {
        success: true,
        plop: 'plop',
    };
};
export const createUserRemovedHandler = (deps: Deps) => (event: Envelope<Event>) => handler(event, deps);
