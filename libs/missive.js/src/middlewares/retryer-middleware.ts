import { BusKinds, MessageRegistryType } from '../core/bus.js';
import { Stamp } from '../core/envelope.js';
import { Middleware } from '../core/middleware.js';
import { buildSleeper, sleeperFactory } from '../utils/sleeper.js';
import { RetryConfiguration } from '../utils/types.js';

type BasicOptions = RetryConfiguration;
type Options<Def> = BasicOptions & {
    intents?: Partial<Record<keyof Def, BasicOptions>>;
};
export type RetriedStamp = Stamp<{ attempt: number; errorMessage: string }, 'missive:retried'>;

export function createRetryerMiddleware<BusKind extends BusKinds, T extends MessageRegistryType<BusKind>>(
    options: Options<T> = {},
): Middleware<BusKind, T> {
    const defaultSleeper = buildSleeper(options);
    const sleeperRegistry: Record<string, ReturnType<typeof sleeperFactory>> = {};
    return async (envelope, next) => {
        const type = envelope.message.__type;
        if (options?.intents?.[type] && !sleeperRegistry[type]) {
            sleeperRegistry[type] = buildSleeper(options.intents[type]);
        }
        const maxAttempts = options.intents?.[type]?.maxAttempts || options.maxAttempts || 3;
        const sleeper = sleeperRegistry[type] || defaultSleeper;
        let attempt = 1;
        sleeper.reset();
        let lastError: unknown | null = null;
        while (attempt <= maxAttempts) {
            try {
                const initialErrorStampCount = envelope.stamps.filter((stamp) => stamp.type === 'error').length;
                await next();
                const errorStampCount = envelope.stamps.filter((stamp) => stamp.type === 'error').length;
                const newErrorStampCount = errorStampCount - initialErrorStampCount;
                if (newErrorStampCount === 0) {
                    // no new error, we are goog to go
                    return;
                }
                envelope.addStamp<RetriedStamp>('missive:retried', {
                    attempt,
                    errorMessage: `New error stamp count: ${newErrorStampCount}`,
                });
            } catch (error) {
                lastError = error;
                envelope.addStamp<RetriedStamp>('missive:retried', {
                    attempt,
                    errorMessage: error instanceof Error ? error.message : String(error),
                });
            }
            attempt++;
            if (attempt > maxAttempts) {
                // if we have an error, we throw it
                if (lastError !== null) {
                    throw lastError;
                }
                // if we don't have an error because the retries we based on an error stamp count, we just return
                return;
            }
            await sleeper.wait();
        }
    };
}
