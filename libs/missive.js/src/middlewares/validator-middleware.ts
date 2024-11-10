import { BusKinds, MessageRegistry, MessageRegistryType } from '../core/bus.js';
import { Envelope, HandledStamp } from '../core/envelope.js';
import { Middleware } from '../core/middleware.js';
import { MissiveMiddlewareError } from '../core/errors.js';

type Validators<BusKind extends BusKinds, T extends MessageRegistryType<BusKind>> = {
    intents?: {
        [K in keyof T]?: {
            input?: (message: NarrowedEnvelope<BusKind, T, K>['message']) => boolean;
            output?: (result: T[K]['result'] | undefined) => boolean;
        };
    };
};

type NarrowedEnvelope<BusKind extends BusKinds, T extends MessageRegistryType<BusKind>, K extends keyof T> = Envelope<
    MessageRegistry<BusKind, Pick<T, K>>
>;

function identity() {
    return true;
}

export function createValidatorMiddleware<BusKind extends BusKinds, T extends MessageRegistryType<BusKind>>(
    input?: Validators<BusKind, T>,
): Middleware<BusKind, T> {
    return async (envelope, next) => {
        const intents = input?.intents;

        const type = envelope.message.__type as keyof T;
        const validateInput = intents?.[type]?.input ?? identity;
        if (!validateInput(envelope.message)) {
            throw new MissiveMiddlewareError('validator', 'Invalid message');
        }
        await next();
        const results = envelope.stampsOfType<HandledStamp<T[typeof type]['result']>>('missive:handled');

        for (const result of results) {
            const validateOutput = intents?.[type]?.output ?? identity;
            if (!validateOutput(result?.body)) {
                throw new MissiveMiddlewareError('validator', 'Invalid result');
            }
        }
    };
}
