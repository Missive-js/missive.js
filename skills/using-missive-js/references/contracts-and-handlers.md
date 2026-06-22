# Contracts, handlers, and dispatch

The complete reference for defining what a bus can carry, implementing handlers, and moving
messages through. Everything imports from `'missive.js'`.

## Table of contents

- [The contract type](#the-contract-type)
- [Defining a command / query / event slice](#defining-a-slice)
- [Composing the registry and bus types](#composing-the-registry)
- [Creating a bus](#creating-a-bus)
- [Registering handlers](#registering-handlers)
- [Creating and dispatching intents](#creating-and-dispatching-intents)
- [Reading results and stamps](#reading-results-and-stamps)
- [Re-dispatching an envelope](#re-dispatching)
- [Errors](#errors)
- [Exact public API surface](#exact-public-api-surface)

## The contract type

A **contract** (`HandlerDefinition`) maps a message name to its input and result. The input is keyed
by the **bus kind**:

```typescript
// the underlying shape (you rarely write this directly)
type HandlerDefinition<BusKind, Intent, Result> = { [key in BusKind]: Intent } & { result: Result };

// so a command entry looks like:   { createUser: { command: Input; result: Output } }
//    a query entry looks like:     { getUser:    { query:   Input; result: Output } }
//    an event entry looks like:    { userCreated:{ event:   Input; result: Output } }
```

You build entries with the three sugar helpers (the input key is chosen for you):

```typescript
export type CommandHandlerDefinition<Name extends string, Command, Result>
export type QueryHandlerDefinition<Name extends string, Query, Result>
export type EventHandlerDefinition<Name extends string, Event, Result>
```

> **The input key must match the bus kind.** A command definition uses `command`, a query uses
> `query`, an event uses `event`. Naming a type `MyEvents` and putting it on a query bus is
> cosmetic — only the _key_ matters to the type system and to `createIntent`'s payload spreading.

## Defining a slice

The idiomatic unit is one file per use-case: schema → derived types → definition → handler →
factory. Result type is **inferred from the handler** so it can never drift from the implementation.

**Command** (`domain/use-cases/create-user.ts`):

```typescript
import { z } from 'zod';
import { CommandHandlerDefinition, Envelope } from 'missive.js';

type Deps = { userRepo: UserRepo };

export const createUserCommandSchema = z.object({
    firstname: z.string(),
    lastname: z.string(),
    email: z.string().email(),
});

type Command = z.infer<typeof createUserCommandSchema>;
type Result = Awaited<ReturnType<typeof handler>>;
export type CreateUserHandlerDefinition = CommandHandlerDefinition<'createUser', Command, Result>;

const handler = async (envelope: Envelope<Command>, deps: Deps) => {
    const { firstname, lastname, email } = envelope.message;
    const userId = await deps.userRepo.create({ firstname, lastname, email });
    return { userId, success: true };
};

export const createCreateUserHandler = (deps: Deps) => (command: Envelope<Command>) => handler(command, deps);
```

**Query** (`domain/use-cases/get-user.ts`) — same shape, `query` key, `createQueryBus` later:

```typescript
import { z } from 'zod';
import { QueryHandlerDefinition, Envelope, CacheableStamp } from 'missive.js';

type Deps = { userRepo: UserRepo };

export const getUserQuerySchema = z.object({ userId: z.string() });
type Query = z.infer<typeof getUserQuerySchema>;
type Result = Awaited<ReturnType<typeof handler>>;
export type GetUserHandlerDefinition = QueryHandlerDefinition<'getUser', Query, Result>;

const handler = async (envelope: Envelope<Query>, deps: Deps) => {
    const user = await deps.userRepo.byId(envelope.message.userId);
    // opt this query into caching from inside the handler (see middlewares ref → cacher)
    envelope.addStamp<CacheableStamp>('missive:cacheable', { ttl: 1800 });
    return { user };
};

export const createGetUserHandler = (deps: Deps) => (query: Envelope<Query>) => handler(query, deps);
```

**Event** (`domain/use-cases/user-created.ts`) — `event` key, may have _many_ handlers:

```typescript
import { z } from 'zod';
import { EventHandlerDefinition, Envelope } from 'missive.js';

type Deps = { mailer: Mailer };

export const userCreatedEventSchema = z.object({ userId: z.string() });
type Event = z.infer<typeof userCreatedEventSchema>;
type Result = Awaited<ReturnType<typeof handler>>;
export type UserCreatedHandlerDefinition = EventHandlerDefinition<'userCreated', Event, Result>;

const handler = async (envelope: Envelope<Event>, deps: Deps) => {
    await deps.mailer.sendWelcome(envelope.message.userId);
    return { success: true };
};

export const createUserCreatedHandler = (deps: Deps) => (event: Envelope<Event>) => handler(event, deps);
```

## Composing the registry

Intersect every definition into one registry, then alias the generic bus type so call sites stay
clean (`domain/contracts/bus.ts`):

```typescript
import { CommandBus as MissiveCommandBus, QueryBus as MissiveQueryBus, EventBus as MissiveEventBus } from 'missive.js';
import { CreateUserHandlerDefinition } from '../use-cases/create-user.js';
import { GetUserHandlerDefinition } from '../use-cases/get-user.js';
import { UserCreatedHandlerDefinition } from '../use-cases/user-created.js';

export type CommandHandlerRegistry = CreateUserHandlerDefinition; // & OtherCommand...
export type QueryHandlerRegistry = GetUserHandlerDefinition; // & OtherQuery...
export type EventHandlerRegistry = UserCreatedHandlerDefinition; // & OtherEvent...

export type CommandBus = MissiveCommandBus<CommandHandlerRegistry>;
export type QueryBus = MissiveQueryBus<QueryHandlerRegistry>;
export type EventBus = MissiveEventBus<EventHandlerRegistry>;
```

The exported bus types (`CommandBus`/`QueryBus`/`EventBus`) are **generic** and require the
registry type argument. Aliasing them once (as above) is what lets you annotate
`const bus: CommandBus = ...` everywhere else without repeating it.

## Creating a bus

```typescript
import { createCommandBus, createQueryBus, createEventBus } from 'missive.js';

const commandBus: CommandBus = createCommandBus<CommandHandlerRegistry>();
const queryBus: QueryBus = createQueryBus<QueryHandlerRegistry>();
const eventBus: EventBus = createEventBus<EventHandlerRegistry>();
```

The optional argument lets you pre-load middleware and handlers and override the UUID generator:

```typescript
const commandBus: CommandBus = createCommandBus<CommandHandlerRegistry>({
    middlewares: [loggerMiddleware, createEventsMiddleware(eventBus)], // run in array order
    handlers: [{ messageName: 'createUser', handler: createCreateUserHandler({ userRepo }) }],
    options: { randomUUID: async () => nanoid() }, // default is crypto.randomUUID()
});
```

## Registering handlers

```typescript
bus.register('createUser', createCreateUserHandler({ userRepo }));
```

- **Two arguments only:** the message name and the handler. **No schema argument** (that is the
  validator middleware's job — see `references/middlewares.md`).
- Registering the **same name twice** adds _both_ handlers; on dispatch they run **concurrently**
  (`Promise.all`). This is what makes an event bus a fan-out. (Mechanically allowed on any bus; by
  convention commands and queries have exactly one.)
- The handler's argument and return types are checked against the registry entry for that name.

## Creating and dispatching intents

Never hand-build the message object. Use the bus's renamed creator — it validates the name exists
and stamps the `__type` discriminator:

```typescript
const intent = commandBus.createCommand('createUser', {
    firstname: 'Ada',
    lastname: 'Lovelace',
    email: 'ada@example.com',
});
const query = queryBus.createQuery('getUser', { userId: '42' });
const event = eventBus.createEvent('userCreated', { userId: '42' });

const { envelope, result, results } = await commandBus.dispatch(intent);
```

- The creator is **named per bus**: `createCommand` / `createQuery` / `createEvent`. There is no
  generic `createIntent` method on the bus object.
- The payload is **flattened** into the message (`{ __type, ...payload }`), so your payload must not
  contain its own `__type` key.
- `dispatch` accepts either a freshly created intent _or_ an existing `Envelope` (for re-dispatch).

## Reading results and stamps

`dispatch` resolves to `{ envelope, result, results }`:

```typescript
const { envelope, result, results } = await bus.dispatch(intent);

result; // the LAST handler's return value, or undefined if no handler ran
results; // an array of EVERY handler's return value (use on fan-out / event buses)

// inspect metadata attached along the way
envelope.message; // the (typed) payload
envelope.stampsOfType('missive:handled'); // all handler-result stamps
envelope.firstStamp<IdentityStamp>('missive:identity')?.body?.id; // the dispatch UUID
envelope.lastStamp('missive:timings'); // e.g. from the logger middleware
```

The envelope API is: `message`, `stamps`, `addStamp(type, body?)`, `firstStamp(type)`,
`lastStamp(type)`, `stampsOfType(type)`.

Built-in engine stamps:

| Stamp              | Type string           | Meaning                                                 |
| ------------------ | --------------------- | ------------------------------------------------------- |
| `IdentityStamp`    | `missive:identity`    | `{ id }` UUID assigned on dispatch                      |
| `HandledStamp<R>`  | `missive:handled`     | one per handler return value; drives `result`/`results` |
| `ReprocessedStamp` | `missive:reprocessed` | snapshot of prior stamps on re-dispatch                 |

## Re-dispatching

Pass a whole `Envelope` back into `dispatch` to reprocess it. The engine keeps the original
`missive:identity` id and moves the prior stamps into a single `missive:reprocessed` stamp on a
fresh envelope (they are _not_ replayed as live stamps). Useful for queue consumers and retries
that hand the envelope around.

## Errors

- Dispatching or creating an intent for an **unregistered name** throws a plain
  `Error('No handler found for type: <type>')`.
- A middleware failure throws `MissiveMiddlewareError(middlewareName, message, envelope?, error?)`,
  whose message is prefixed `missive.js: [middleware: <name>]:` and whose `cause` carries
  `{ envelope, error }`. The validator middleware throws this with `'Invalid message'` (input) or
  `'Invalid result'` (output).

## Exact public API surface

Verbatim from `libs/missive.js/src/core/bus.ts`:

```typescript
// methods present on every bus (creator is renamed per kind)
use:      (middleware: Middleware<BusKind, Defs>) => void;
register: <N extends keyof Defs & string>(type: N, handler: MessageHandler<Defs[N][BusKind], Defs[N]['result']>) => void;
dispatch: <N extends keyof Defs & string>(intent: TypedMessage<Defs[N][BusKind], N> | Envelope<...>)
            => Promise<{ envelope: Envelope<Defs[N][BusKind]>; result: Defs[N]['result'] | undefined; results: (Defs[N]['result'] | undefined)[] }>;
createCommand | createQuery | createEvent: <N extends keyof Defs & string>(type: N, intent: Defs[N][BusKind]) => TypedMessage<Defs[N][BusKind], N>;

// core types (from core/envelope.ts)
type Envelope<T> = {
    stamps: Stamp[];
    message: T;
    addStamp: <S extends Stamp>(type: S['type'], body?: S['body']) => void;
    firstStamp: <S extends Stamp>(type: S['type']) => S | undefined;
    lastStamp: <S extends Stamp>(type: S['type']) => S | undefined;
    stampsOfType: <S extends Stamp>(type: S['type']) => S[];
};
type Stamp<C = unknown, T extends string = string> = { type: T; body?: C; date: Date };
type TypedMessage<Message, Name extends string = string> = Message & { __type: Name };
```
