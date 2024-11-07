import { BusKinds, MessageRegistry, MessageRegistryType } from '../core/bus.js';
import { Envelope } from '../core/envelope.js';
import { Middleware } from '../core/middleware.js';
import { MissiveMiddlewareError } from '../core/errors.js';

type Validators<BusKind extends BusKinds, T extends MessageRegistryType<BusKind>> = Partial<{
    [K in keyof T]: (message: NarrowedEnvelope<BusKind, T, K>['message']) => boolean;
}>;

type NarrowedEnvelope<BusKind extends BusKinds, T extends MessageRegistryType<BusKind>, K extends keyof T> = Envelope<
    MessageRegistry<BusKind, Pick<T, K>>
>;

export function createValidatorMiddleware<BusKind extends BusKinds, T extends MessageRegistryType<BusKind>>(
    options?: Validators<BusKind, T>,
): Middleware<BusKind, T> {
    return async (envelope, next) => {
        const type = envelope.message.__type;
        const validate = options?.[type as keyof Validators<BusKind, T>] ?? (() => true);
        if (!validate(envelope.message)) {
            throw new MissiveMiddlewareError('validator', 'Invalid message');
        }
        await next();
    };
}
