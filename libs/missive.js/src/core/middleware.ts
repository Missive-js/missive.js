import type { BusKinds, MessageRegistry, MessageRegistryType } from './bus';
import type { Envelope } from './envelope';

export type Middleware<BusKind extends BusKinds, HandlerDefinitions extends MessageRegistryType<BusKind>> = (
    envelope: Envelope<MessageRegistry<BusKind, HandlerDefinitions>>,
    next: () => Promise<void>,
) => Promise<void>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type GenericMiddleware = Middleware<BusKinds, any>;
