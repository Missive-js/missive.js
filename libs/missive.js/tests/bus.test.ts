import { expect, it, beforeEach, describe } from 'vitest';
import { z, Schema } from 'zod';
import { Envelope } from '../src/envelope';
import { createQueryBus, MissiveQueryBus, QueryMiddleware } from '../src/bus';

type MyEvents = {
    event1: { query: { foo: string }; result: { bar: number } };
    event2: { query: { baz: boolean }; result: { qux: string } };
};

describe('Bus', () => {
    let bus: MissiveQueryBus<MyEvents>;

    beforeEach(() => {
        bus = createQueryBus<MyEvents>();
    });

    it('should register and dispatch a query event', async () => {
        const schema: Schema<MyEvents['event1']['query']> = z.object({ foo: z.string() });
        const handler = async (
            envelope: Envelope<MyEvents['event1']['query']>,
        ): Promise<MyEvents['event1']['result']> => {
            expect(envelope.message.foo).toBe('test');
            return { bar: 42 };
        };

        bus.register('event1', schema, handler);
        const intent = bus.createQuery('event1', { foo: 'test' });
        const result = await bus.dispatch(intent);

        expect(result.result).toEqual({ bar: 42 });
    });

    it('should register and dispatch a command event', async () => {
        const schema: Schema<MyEvents['event2']['query']> = z.object({ baz: z.boolean() });
        const handler = async (
            envelope: Envelope<MyEvents['event2']['query']>,
        ): Promise<MyEvents['event2']['result']> => {
            expect(envelope.message.baz).toBe(true);
            return { qux: 'success' };
        };
        bus.register('event2', schema, handler);

        const intent = bus.createQuery('event2', { baz: true });
        const result = await bus.dispatch(intent);

        expect(result.result).toEqual({ qux: 'success' });
    });

    it('should use middleware', async () => {
        const schema: Schema<MyEvents['event1']['query']> = z.object({ foo: z.string() });
        const handler = async (
            envelope: Envelope<MyEvents['event1']['query']>,
        ): Promise<MyEvents['event1']['result']> => {
            expect(envelope.message.foo).toBe('test');
            return { bar: 42 };
        };

        const middleware: QueryMiddleware<MyEvents> = async (envelope, next) => {
            envelope.addStamp('middleware', { added: true });
            await next();
        };

        bus.use(middleware);
        bus.register('event1', schema, handler);

        const intent = bus.createQuery('event1', { foo: 'test' });
        const result = await bus.dispatch(intent);

        expect(result.envelope.stampsOfType('middleware').length).toBe(1);
        expect(result.result).toEqual({ bar: 42 });
    });

    it('should throw an error for unregistered event types', async () => {
        const intent = { __type: 'unregistered', foo: 'test' };
        // @ts-expect-error -- intentionally, we test for the error
        await expect(bus.dispatch(intent)).rejects.toThrow('No handler found for type: unregistered');
    });

    it('should throw an error for invalid intent', () => {
        const schema: Schema<MyEvents['event1']['query']> = z.object({ foo: z.string() });
        const handler = async (
            envelope: Envelope<MyEvents['event1']['query']>,
        ): Promise<MyEvents['event1']['result']> => {
            expect(envelope.message.foo).toBe(123);
            return { bar: 42 };
        };

        bus.register('event1', schema, handler);
        // @ts-expect-error -- intentionally, we test for the error
        expect(() => bus.createIntent('event1', { foo: 123 })).toThrow();
    });
});
