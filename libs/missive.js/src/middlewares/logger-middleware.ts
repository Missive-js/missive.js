import { Envelope, HandledStamp, IdentityStamp, Stamp } from '../core/envelope';
import { GenericMiddleware } from '../core/middleware';

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

type Options = {
    adapter: LoggerAdapter;
    logger: LoggerInterface;
    collect: boolean;
    async: boolean;
};
export function createLoggerMiddleware({
    adapter,
    logger,
    collect = false,
    async = false,
}: Partial<Options> = {}): GenericMiddleware {
    if (!logger) {
        logger = console;
    }
    if (!adapter) {
        adapter = {
            processing: (identity, message, results, stamps) =>
                logger.log(
                    `[Envelope<${identity?.body?.id}>](Processing)`,
                    JSON.stringify({
                        message,
                        results,
                        stamps,
                    }),
                ),
            processed: (identity, message, results, stamps) => {
                const timings = stamps.filter((stamp) => stamp.type === 'missive:timings')?.[0] as
                    | TimingsStamp
                    | undefined;
                logger.log(
                    `[Envelope<${identity?.body?.id}>](Processed${timings?.body?.total ? ` in ${(timings.body.total / 1000000).toFixed(4)} ms` : ''})`,
                    JSON.stringify({
                        message,
                        results,
                        stamps,
                    }),
                );
            },
            error: (identity, message, results, stamps) => {
                const timings = stamps.filter((stamp) => stamp.type === 'missive:timings')?.[0] as
                    | TimingsStamp
                    | undefined;
                logger.error(
                    `[Envelope<${identity?.body?.id}>](Errored${timings?.body?.total ? ` in ${(timings.body.total / 1000000).toFixed(4)} ms` : ''}`,
                    JSON.stringify({
                        message,
                        results,
                        stamps,
                    }),
                );
            },
        };
    }

    const log = async (step: Step, envelope: Envelope<unknown>) => {
        const identity = envelope.firstStamp<IdentityStamp>('missive:identity');
        const results = envelope.stampsOfType<HandledStamp<unknown>>('missive:handled');
        const promise = adapter[step](
            identity,
            envelope.message,
            results,
            envelope.stamps.filter((stamp) => stamp.type !== 'missive:identity' && stamp.type !== 'missive:handled'),
        );
        if (collect) {
            return promise;
        }
        if (!async && promise instanceof Promise) {
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
        if (!collect) {
            await log('processing', envelope);
            try {
                await next();
                attachNanoTimingStamp(startTime, envelope);
                await log('processed', envelope);
            } catch (error) {
                attachNanoTimingStamp(startTime, envelope);
                await log('error', envelope);
                throw error;
            }
            return;
        }
        const logs: Array<() => Promise<void>> = [];
        logs.push(() => log('processing', envelope));
        try {
            await next();
            attachNanoTimingStamp(startTime, envelope);
            logs.push(() => log('processed', envelope));
        } catch (error) {
            attachNanoTimingStamp(startTime, envelope);
            logs.push(() => log('error', envelope));
            throw error;
        } finally {
            const allLogs = Promise.all(logs.map((log) => log()));
            if (!async) {
                await allLogs;
            }
        }
    };
}
