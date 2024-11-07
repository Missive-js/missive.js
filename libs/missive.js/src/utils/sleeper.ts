import { RetryConfiguration } from './types.js';

export type Sleeper = {
    wait: () => Promise<void>;
    reset: () => void;
};

const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));

type Deps = {
    sleepFn?: (s: number) => Promise<unknown>;
};
export function createFibonnaciSleeper(jitter = 0, deps?: Deps): Sleeper {
    const sleepFn = deps?.sleepFn || sleep;
    let a = 0,
        b = 1;
    return {
        wait: async () => {
            const w = a + b;
            a = b;
            b = w;
            const max = w * (1 + jitter);
            const min = w * (1 - jitter);
            const jitteredDelay = Math.random() * (max - min) + min;
            await sleepFn(jitteredDelay);
        },
        reset: () => {
            a = 0;
            b = 1;
        },
    };
}

export function createExponentialSleeper(multiplier: number = 1.5, jitter: number = 0.5, deps?: Deps): Sleeper {
    const sleepFn = deps?.sleepFn || sleep;
    let currentDelay = 0.5;
    return {
        wait: async () => {
            const max = currentDelay * (1 + jitter);
            const min = currentDelay * (1 - jitter);
            const jitteredDelay = Math.random() * (max - min) + min;
            await sleepFn(jitteredDelay);
            currentDelay = currentDelay * multiplier;
        },
        reset: () => {
            currentDelay = 0.5;
        },
    };
}

export function sleeperFactory({
    waitingAlgorithm,
    multiplier,
    jitter,
}: Omit<RetryConfiguration, 'maxAttempts'>): Sleeper {
    const noneSleeper = () => ({ wait: async () => {}, reset: () => {} });
    if (!waitingAlgorithm || waitingAlgorithm === 'none') {
        return noneSleeper();
    }

    if (waitingAlgorithm === 'exponential') {
        return createExponentialSleeper(multiplier, jitter);
    }

    return createFibonnaciSleeper(jitter);
}

export function buildSleeper({
    waitingAlgorithm = 'exponential',
    multiplier = 1.5,
    jitter = 0.5,
}: Omit<RetryConfiguration, 'maxAttempts'>) {
    return sleeperFactory({ waitingAlgorithm, multiplier, jitter });
}
