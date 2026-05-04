import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFibonnaciSleeper, createExponentialSleeper } from '../src/utils/sleeper';

describe('createFibonnaciSleeper', () => {
    let sleeper: ReturnType<typeof createFibonnaciSleeper>;
    let sleepMock: ReturnType<typeof vi.fn<(s: number) => Promise<unknown>>>;

    beforeEach(() => {
        sleepMock = vi.fn<(s: number) => Promise<unknown>>();
        sleeper = createFibonnaciSleeper(0, { sleepFn: sleepMock });
    });

    it('should follow the Fibonacci sequence', async () => {
        await sleeper.wait();
        expect(sleepMock).toHaveBeenCalledWith(1);

        await sleeper.wait();
        expect(sleepMock).toHaveBeenCalledWith(1);

        await sleeper.wait();
        expect(sleepMock).toHaveBeenCalledWith(2);

        await sleeper.wait();
        expect(sleepMock).toHaveBeenCalledWith(3);

        await sleeper.wait();
        expect(sleepMock).toHaveBeenCalledWith(5);

        await sleeper.wait();
        expect(sleepMock).toHaveBeenCalledWith(8);
    });

    it('should reset the sequence', async () => {
        await sleeper.wait();
        await sleeper.wait();
        sleeper.reset();

        await sleeper.wait();
        expect(sleepMock).toHaveBeenCalledWith(1);
    });
});

describe('createExponentialSleeper with no Jitter', () => {
    let sleeper: ReturnType<typeof createExponentialSleeper>;
    let sleepMock: ReturnType<typeof vi.fn<(s: number) => Promise<unknown>>>;

    beforeEach(() => {
        sleepMock = vi.fn<(s: number) => Promise<unknown>>();
        sleeper = createExponentialSleeper(1.5, 0, { sleepFn: sleepMock });
    });

    it('should follow the exponential sequence', async () => {
        await sleeper.wait();
        expect(sleepMock).toHaveBeenCalledWith(0.5);

        await sleeper.wait();
        expect(sleepMock).toHaveBeenCalledWith(0.75);

        await sleeper.wait();
        expect(sleepMock).toHaveBeenCalledWith(1.125);

        await sleeper.wait();
        expect(sleepMock).toHaveBeenCalledWith(1.6875);

        await sleeper.wait();
        expect(sleepMock).toHaveBeenCalledWith(2.53125);

        await sleeper.wait();
        expect(sleepMock).toHaveBeenCalledWith(3.796875);
    });

    it('should reset the sequence', async () => {
        await sleeper.wait();
        await sleeper.wait();
        sleeper.reset();

        await sleeper.wait();
        expect(sleepMock).toHaveBeenCalledWith(0.5);
    });
});

describe('createExponentialSleeper with 50% Jitter', () => {
    let sleeper: ReturnType<typeof createExponentialSleeper>;
    let sleepMock: ReturnType<typeof vi.fn<(s: number) => Promise<unknown>>>;

    const jitter = 0.5;
    const range = (delay: number) => [delay * (1 - jitter), delay * (1 + jitter)];
    beforeEach(() => {
        sleepMock = vi.fn<(s: number) => Promise<unknown>>();
        sleeper = createExponentialSleeper(1.5, 0.5, { sleepFn: sleepMock });
    });

    it('should follow the exponential sequence with jitter', async () => {
        await sleeper.wait();
        let jitteredDelay = sleepMock.mock.calls[0][0];
        let [min, max] = range(0.5);
        expect(jitteredDelay).toBeGreaterThanOrEqual(min);
        expect(jitteredDelay).toBeLessThanOrEqual(max);

        await sleeper.wait();
        jitteredDelay = sleepMock.mock.calls[1][0];
        [min, max] = range(0.75);
        expect(jitteredDelay).toBeGreaterThanOrEqual(min);
        expect(jitteredDelay).toBeLessThanOrEqual(max);

        await sleeper.wait();
        jitteredDelay = sleepMock.mock.calls[2][0];
        [min, max] = range(1.125);
        expect(jitteredDelay).toBeGreaterThanOrEqual(min);
        expect(jitteredDelay).toBeLessThanOrEqual(max);

        await sleeper.wait();
        jitteredDelay = sleepMock.mock.calls[3][0];
        [min, max] = range(1.6875);
        expect(jitteredDelay).toBeGreaterThanOrEqual(min);
        expect(jitteredDelay).toBeLessThanOrEqual(max);

        await sleeper.wait();
        jitteredDelay = sleepMock.mock.calls[4][0];
        [min, max] = range(2.53125);
        expect(jitteredDelay).toBeGreaterThanOrEqual(min);
        expect(jitteredDelay).toBeLessThanOrEqual(max);

        await sleeper.wait();
        jitteredDelay = sleepMock.mock.calls[5][0];
        [min, max] = range(3.796875);
        expect(jitteredDelay).toBeGreaterThanOrEqual(min);
        expect(jitteredDelay).toBeLessThanOrEqual(max);
    });

    it('should reset the sequence', async () => {
        await sleeper.wait();
        await sleeper.wait();
        sleeper.reset();

        await sleeper.wait();
        const jitteredDelay = sleepMock.mock.calls[0][0];
        const [min, max] = range(0.5);
        expect(jitteredDelay).toBeGreaterThanOrEqual(min);
        expect(jitteredDelay).toBeLessThanOrEqual(max);
    });
});
