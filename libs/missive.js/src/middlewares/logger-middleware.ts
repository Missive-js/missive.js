import { createLoggerAdapter } from '../adapters/console-logger-adapter.js';
import { BusKinds, MessageRegistryType } from '../core/bus.js';
import { Envelope, HandledStamp, IdentityStamp, Stamp } from '../core/envelope.js';
import { Middleware } from '../core/middleware.js';

export type LoggerAdapter = {
    processing: LogFunction;
    processed: LogFunction;
    error: LogFunction;
};

export type LoggerInterface = {
    log: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
};

export type TimingsStamp = Stamp<{ total: number }, 'missive:timings'>;

type Step = keyof LoggerAdapter;
type LogFunction = <M, R>(
    identity: IdentityStamp | undefined,
    message: M,
    results: HandledStamp<R>[],
    stamps: Stamp[],
) => void | Promise<void>;

type BasicOptions = {
    collect?: boolean;
    async?: boolean;
};

type Options<Def> = BasicOptions & {
    adapter: LoggerAdapter;
    logger: LoggerInterface;
    intents?: Partial<Record<keyof Def, BasicOptions>>;
};

export function createLoggerMiddleware<BusKind extends BusKinds, T extends MessageRegistryType<BusKind>>({
    adapter,
    logger,
    intents,
    collect = false,
    async = false,
}: Partial<Options<T>> = {}): Middleware<BusKind, T> {
    if (!logger) {
        logger = console;
    }
    if (!adapter) {
        adapter = createLoggerAdapter({ logger });
    }

    const log = async (step: Step, envelope: Envelope<unknown>, doAsync: boolean, stampsSnapshot?: Stamp[]) => {
        // use a snapshot when provided so a deferred (collect-mode) log reflects the state at push time
        const stamps = stampsSnapshot ?? envelope.stamps;
        const identity = stamps.find((stamp) => stamp.type === 'missive:identity') as IdentityStamp | undefined;
        const results = stamps.filter((stamp) => stamp.type === 'missive:handled') as HandledStamp<unknown>[];
        const promise = adapter[step](
            identity,
            envelope.message,
            results,
            stamps.filter((stamp) => stamp.type !== 'missive:identity' && stamp.type !== 'missive:handled'),
        );
        if (doAsync) {
            return promise;
        }
        if (!doAsync && promise instanceof Promise) {
            await promise;
        }
    };
    const attachNanoTimingStamp = (startTime: number, envelope: Envelope<unknown>) => {
        const endTime = performance.now();
        const duration = (endTime - startTime) * 1000000; // nanoseconds
        envelope.addStamp<TimingsStamp>('missive:timings', {
            total: duration,
        });
    };

    return async (envelope, next) => {
        const startTime = performance.now();
        const type = envelope.message.__type;
        const doCollect = intents?.[type]?.collect ?? collect;
        const doAsync = intents?.[type]?.async ?? async;

        if (!doCollect) {
            await log('processing', envelope, doAsync);
            try {
                await next();
                attachNanoTimingStamp(startTime, envelope);
                await log('processed', envelope, doAsync);
            } catch (error) {
                attachNanoTimingStamp(startTime, envelope);
                await log('error', envelope, doAsync);
                throw error;
            }
            return;
        }
        const logs: Array<() => Promise<void>> = [];
        // snapshot the stamps now so the deferred 'processing' log reflects the pre-next() state
        const processingStamps = [...envelope.stamps];
        logs.push(() => log('processing', envelope, doAsync, processingStamps));
        try {
            await next();
            attachNanoTimingStamp(startTime, envelope);
            logs.push(() => log('processed', envelope, doAsync));
        } catch (error) {
            attachNanoTimingStamp(startTime, envelope);
            logs.push(() => log('error', envelope, doAsync));
            throw error;
        } finally {
            const allLogs = Promise.allSettled(logs.map((log) => log()));
            if (!doAsync) {
                await allLogs;
            }
        }
    };
}
