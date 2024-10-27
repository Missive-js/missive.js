import { Middleware } from 'missive.js';
import { CommandHandlerRegistry, EventBus, UserCreatedEventStamp, UserRemovedEventStamp } from '../contracts/bus.js';

export const createEventsMiddleware =
    (eventBus: EventBus): Middleware<'command', CommandHandlerRegistry> =>
    async (envelope, next) => {
        await next();
        const eventsStamps = envelope.stampsOfType<UserCreatedEventStamp | UserRemovedEventStamp>('event');
        for (const eventStamp of eventsStamps) {
            if (eventStamp.body) {
                const event = eventBus.createEvent(eventStamp.body._type, {
                    userId: eventStamp.body.userId,
                });
                const results = await eventBus.dispatch(event);
                console.log('Events Middleware: Event Dispatched', results);
            }
        }
    };
