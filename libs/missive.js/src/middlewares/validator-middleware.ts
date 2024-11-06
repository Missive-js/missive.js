import { BusKinds, MessageRegistry, MessageRegistryType } from '../core/bus';
import { Envelope } from '../core/envelope';
import { Middleware } from '../core/middleware';
import { MissiveMiddlewareError } from './errors';

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
