import { expect, it, beforeEach, describe } from 'vitest';
import { z, Schema } from 'zod';
import { Envelope } from '../src/core/envelope';
import { createQueryBus, QueryBus } from '../src/core/bus';
import { Middleware } from '../src/core/middleware';

type MyEvents = {
    event1: { query: { foo: string }; result: { bar: number } };
    event2: { query: { baz: boolean }; result: { qux: string } };
};

describe('Bus', () => {
    let bus: QueryBus<MyEvents>;

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

        const middleware: Middleware<'query', MyEvents> = async (envelope, next) => {
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

    it('should execute middlewares in the correct order', async () => {
        const schema: Schema<MyEvents['event1']['query']> = z.object({ foo: z.string() });
        const handler = async (): Promise<MyEvents['event1']['result']> => {
            return { bar: 42 };
        };

        const middlewareOrder: string[] = [];
        const middlewareOrder2: string[] = [];
        const middleware1: Middleware<'query', MyEvents> = async (envelope, next) => {
            middlewareOrder.push('middleware1');
            await next();
            middlewareOrder2.push('middleware1');
        };
        const middleware2: Middleware<'query', MyEvents> = async (envelope, next) => {
            middlewareOrder.push('middleware2');
            await next();
            middlewareOrder2.push('middleware2');
        };
        const middleware3: Middleware<'query', MyEvents> = async (envelope, next) => {
            middlewareOrder.push('middleware3');
            await next();
            middlewareOrder2.push('middleware3');
        };
        const middleware4: Middleware<'query', MyEvents> = async (envelope, next) => {
            middlewareOrder.push('middleware4');
            await next();
            middlewareOrder2.push('middleware4');
        };

        bus.use(middleware1);
        bus.use(middleware2);
        bus.use(middleware3);
        bus.use(middleware4);
        bus.register('event1', schema, handler);

        const intent = bus.createQuery('event1', { foo: 'test' });
        await bus.dispatch(intent);

        expect(middlewareOrder).toEqual(['middleware1', 'middleware2', 'middleware3', 'middleware4']);
        expect(middlewareOrder2).toEqual(['middleware4', 'middleware3', 'middleware2', 'middleware1']);
    });

    it('should stop middlewares', async () => {
        const schema: Schema<MyEvents['event1']['query']> = z.object({ foo: z.string() });
        const handler = async (): Promise<MyEvents['event1']['result']> => {
            return { bar: 42 };
        };

        const middlewareOrder: string[] = [];
        const middlewareOrder2: string[] = [];

        const middleware1: Middleware<'query', MyEvents> = async (envelope, next) => {
            middlewareOrder.push('middleware1');
            await next();
            middlewareOrder2.push('middleware1');
        };

        const middleware2: Middleware<'query', MyEvents> = async (envelope, next) => {
            middlewareOrder.push('middleware2');
            await next();
            middlewareOrder2.push('middleware2');
        };
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const middleware3: Middleware<'query', MyEvents> = async (envelope, next) => {
            middlewareOrder.push('middleware3');
            middlewareOrder2.push('middleware3');
        };

        const middleware4: Middleware<'query', MyEvents> = async (envelope, next) => {
            middlewareOrder.push('middleware4');
            await next();
            middlewareOrder2.push('middleware4');
        };

        const middleware5: Middleware<'query', MyEvents> = async (envelope, next) => {
            middlewareOrder.push('middleware5');
            await next();
            middlewareOrder2.push('middleware5');
        };

        bus.use(middleware1);
        bus.use(middleware2);
        bus.use(middleware3);
        bus.use(middleware4);
        bus.use(middleware5);
        bus.register('event1', schema, handler);

        const intent = bus.createQuery('event1', { foo: 'test' });
        await bus.dispatch(intent);

        expect(middlewareOrder).toEqual(['middleware1', 'middleware2', 'middleware3']);
        expect(middlewareOrder2).toEqual(['middleware3', 'middleware2', 'middleware1']);
    });

    it('should allow middleware to modify the envelope', async () => {
        const schema: Schema<MyEvents['event1']['query']> = z.object({ foo: z.string() });
        const handler = async (
            envelope: Envelope<MyEvents['event1']['query']>,
        ): Promise<MyEvents['event1']['result']> => {
            expect(envelope.message.foo).toBe('modified');
            return { bar: 42 };
        };

        const middleware: Middleware<'query', MyEvents> = async (envelope, next) => {
            if ('foo' in envelope.message) {
                envelope.message.foo = 'modified';
            }

            await next();
        };

        bus.use(middleware);
        bus.register('event1', schema, handler);

        const intent = bus.createQuery('event1', { foo: 'test' });
        const result = await bus.dispatch(intent);

        expect(result.result).toEqual({ bar: 42 });
    });

    it('should execute multiple middleware functions', async () => {
        const schema: Schema<MyEvents['event1']['query']> = z.object({ foo: z.string() });
        const handler = async (): Promise<MyEvents['event1']['result']> => {
            return { bar: 42 };
        };

        let middleware1Executed = false;
        let middleware2Executed = false;

        const middleware1: Middleware<'query', MyEvents> = async (envelope, next) => {
            middleware1Executed = true;
            await next();
        };
        const middleware2: Middleware<'query', MyEvents> = async (envelope, next) => {
            middleware2Executed = true;
            await next();
        };

        bus.use(middleware1);
        bus.use(middleware2);
        bus.register('event1', schema, handler);

        const intent = bus.createQuery('event1', { foo: 'test' });
        await bus.dispatch(intent);

        expect(middleware1Executed).toBe(true);
        expect(middleware2Executed).toBe(true);
    });

    it('should execute middleware and handlers together correctly', async () => {
        const schema: Schema<MyEvents['event1']['query']> = z.object({ foo: z.string() });
        const handler = async (
            envelope: Envelope<MyEvents['event1']['query']>,
        ): Promise<MyEvents['event1']['result']> => {
            expect(envelope.message.foo).toBe('middleware-modified');
            return { bar: 42 };
        };

        const middleware: Middleware<'query', MyEvents> = async (envelope, next) => {
            if ('foo' in envelope.message) {
                envelope.message.foo = 'middleware-modified';
            }
            await next();
        };

        bus.use(middleware);
        bus.register('event1', schema, handler);

        const intent = bus.createQuery('event1', { foo: 'test' });
        const result = await bus.dispatch(intent);

        expect(result.result).toEqual({ bar: 42 });
    });
});
