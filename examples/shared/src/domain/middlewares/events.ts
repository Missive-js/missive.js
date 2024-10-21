import { Middleware } from 'missive.js';
import { CommandDefitions, EventBus, UserCreatedEventStamp, UserRemovedEventStamp } from '../contracts/bus.js';

export const createEventsMiddleware =
    (eventBus: EventBus): Middleware<'command', CommandDefitions> =>
    async (envelope, next) => {
        await next();
        const eventsStamps = envelope.stampsOfType<UserCreatedEventStamp | UserRemovedEventStamp>('event');
        for (const event of eventsStamps) {
            if (event.context) {
                const intent = eventBus.createIntent(event.context._type, {
                    userId: event.context.userId,
                });
                const results = await eventBus.dispatch(intent);
                console.log('Events Middleware: Event Dispatched', results);
            }
        }
    };
