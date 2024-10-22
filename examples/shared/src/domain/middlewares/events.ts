import { CommandMiddleware, Middleware } from 'missive.js';
import { CommandHandlerRegistry, EventBus, UserCreatedEventStamp, UserRemovedEventStamp } from '../contracts/bus.js';

export const createEventsMiddleware =
    (eventBus: EventBus): CommandMiddleware<CommandHandlerRegistry> =>
    async (envelope, next) => {
        await next();
        const eventsStamps = envelope.stampsOfType<UserCreatedEventStamp | UserRemovedEventStamp>('event');
        for (const eventStamp of eventsStamps) {
            if (eventStamp.context) {
                const event = eventBus.createEvent(eventStamp.context._type, {
                    userId: eventStamp.context.userId,
                });
                const results = await eventBus.dispatchEvent(event);
                console.log('Events Middleware: Event Dispatched', results);
            }
        }
    };
