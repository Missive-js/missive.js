import { Envelope } from 'missive.js';
import { Event } from './user-created.js';
type Deps = {};

const handler = async (envelope: Envelope<Event>, deps: Deps) => {
    const { userId } = envelope.message;
    console.log(`User Created Event Handler2: User Created ${userId}`);
    return {
        success: true,
    };
};
export const createUserCreatedHandler2 = (deps: Deps) => (event: Envelope<Event>) => handler(event, deps);
