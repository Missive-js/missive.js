import { LoggerAdapter, LoggerInterface, TimingsStamp } from '../middlewares/logger-middleware.js';

type Deps = {
    logger: LoggerInterface;
    serializer?: (value: unknown) => string;
};
export function createLoggerAdapter({ logger, serializer = JSON.stringify }: Deps) {
    const adapter: LoggerAdapter = {
        processing: (identity, message, results, stamps) =>
            logger.log(
                `[Envelope<${identity?.body?.id}>](Processing)`,
                serializer({
                    message,
                    results,
                    stamps,
                }),
            ),
        processed: (identity, message, results, stamps) => {
            const timings = stamps.find((stamp) => stamp.type === 'missive:timings') as TimingsStamp | undefined;
            logger.log(
                `[Envelope<${identity?.body?.id}>](Processed${timings?.body?.total ? ` in ${(timings.body.total / 1000000).toFixed(4)} ms` : ''})`,
                serializer({
                    message,
                    results,
                    stamps,
                }),
            );
        },
        error: (identity, message, results, stamps) => {
            const timings = stamps.find((stamp) => stamp.type === 'missive:timings') as TimingsStamp | undefined;
            logger.error(
                `[Envelope<${identity?.body?.id}>](Errored${timings?.body?.total ? ` in ${(timings.body.total / 1000000).toFixed(4)} ms` : ''}`,
                serializer({
                    message,
                    results,
                    stamps,
                }),
            );
        },
    };
    return adapter;
}
