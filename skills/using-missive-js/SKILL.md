---
name: using-missive-js
description: >-
    Build and modify TypeScript apps that use the missive.js service bus. Use whenever you see
    `missive.js`, `createCommandBus`/`createQueryBus`/`createEventBus`, `CommandHandlerDefinition`/
    `QueryHandlerDefinition`/`EventHandlerDefinition`, intents, envelopes, stamps, or a CQRS-style
    command/query/event bus in a TS/JS project. Covers defining typed contracts, writing and
    registering handlers, dispatching intents, reading results and stamps, configuring the built-in
    middlewares (validator, cacher, logger, lock, retryer, webhook, feature-flag, mocker, async),
    and implementing custom adapters (cache, lock, logger). Trigger even when the user does not name
    the library explicitly but is clearly modeling commands, queries, events, handlers, or
    cross-cutting middleware on a bus.
---

# Using missive.js

missive.js is a **fully type-safe, in-process service bus** for TypeScript implementing CQRS +
events. One generic engine is exposed through three factories: `createCommandBus`, `createQueryBus`,
`createEventBus`. Everything a consumer touches — handler arguments, results, dispatch payloads — is
statically derived from one user-declared **contract** type. That contract-first design is exactly
why this library is pleasant to build on: you (or the user) declare the typed shape, and the
compiler enforces every handler and call site against it.

This skill teaches an agent to _use_ the library correctly. Read the references when you go deep on
a sub-area; the pointers are at the bottom.

## Mental model (learn these seven words)

| Term                               | What it is                                                                                                                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Intent**                         | The message you dispatch — a `command`, `query`, or `event`. Created with `bus.createCommand/createQuery/createEvent`, never by hand.                                                                              |
| **Contract** (`HandlerDefinition`) | A typed map of `messageName → { <busKind>: Input; result: Result }`. The single type that drives all static checking. Built with `CommandHandlerDefinition` / `QueryHandlerDefinition` / `EventHandlerDefinition`. |
| **Handler**                        | `(envelope: Envelope<Input>) => Promise<Result>`. Registered by name on a bus.                                                                                                                                     |
| **Envelope**                       | Wraps `{ message, stamps }`. Handlers and middleware receive the _envelope_, not the bare message — read the payload via `envelope.message`.                                                                       |
| **Stamp**                          | Timestamped metadata `{ type, body?, date }` attached to the envelope as it travels. The universal extension/communication channel.                                                                                |
| **Middleware**                     | `(envelope, next) => Promise<void>`. The onion around the handler. There is **no separate hook system** — middleware _is_ the hook system.                                                                         |
| **Bus**                            | `command` (mutations, 1 handler), `query` (reads, 1 handler, cacheable), `event` (notifications, 0..N handlers / fan-out). The single/many-handler split is a convention, not enforced.                            |

Everything imports from the package root: `import { ... } from 'missive.js'`.

## The golden path (end-to-end)

A missive.js feature is a **vertical slice**: one file per use-case holding the schema, the derived
types, the contract definition, the handler, and the handler factory. This is the unit of work to
generate or edit.

**1. Define the slice** (`domain/use-cases/create-user.ts`):

```typescript
import { z } from 'zod';
import { CommandHandlerDefinition, Envelope } from 'missive.js';

type Deps = { userRepo: UserRepo }; // the seam: whatever this handler needs

// runtime schema (used by the validator middleware, see step 3)
export const createUserCommandSchema = z.object({
    firstname: z.string(),
    lastname: z.string(),
    email: z.string().email(),
});

type Command = z.infer<typeof createUserCommandSchema>;
type Result = Awaited<ReturnType<typeof handler>>; // result type is INFERRED from the handler
export type CreateUserHandlerDefinition = CommandHandlerDefinition<'createUser', Command, Result>;

// pure business logic — receives the typed envelope + injected deps
const handler = async (envelope: Envelope<Command>, deps: Deps) => {
    const { firstname, lastname, email } = envelope.message;
    const userId = await deps.userRepo.create({ firstname, lastname, email });
    return { userId, success: true };
};

// the factory closes over deps and returns the bus-shaped handler
export const createCreateUserHandler = (deps: Deps) => (command: Envelope<Command>) => handler(command, deps);
```

**2. Compose the registry + bus type** (`domain/contracts/bus.ts`):

```typescript
import { CommandBus as MissiveCommandBus } from 'missive.js';
import { CreateUserHandlerDefinition } from '../use-cases/create-user.js';
import { RemoveUserHandlerDefinition } from '../use-cases/remove-user.js';

// intersect every definition into one registry
export type CommandHandlerRegistry = CreateUserHandlerDefinition & RemoveUserHandlerDefinition;
// alias the generic bus type so call sites can write `: CommandBus` without re-passing the registry
export type CommandBus = MissiveCommandBus<CommandHandlerRegistry>;
```

**3. Wire the composition root** (`core/buses.server.ts`) — create the bus, attach middleware,
register handlers with their injected deps:

```typescript
import { createCommandBus } from 'missive.js';
import { CommandBus, CommandHandlerRegistry } from '../domain/contracts/bus.js';
import { createCreateUserHandler, createUserCommandSchema } from '../domain/use-cases/create-user.js';

const commandBus: CommandBus = createCommandBus<CommandHandlerRegistry>();

// runtime validation lives HERE (in the validator middleware), NOT on register()
commandBus.useValidatorMiddleware({
    intents: {
        createUser: { input: (message) => createUserCommandSchema.safeParse(message).success },
    },
});

commandBus.register('createUser', createCreateUserHandler({ userRepo }));

export { commandBus };
```

**4. Dispatch and read the result**:

```typescript
const intent = commandBus.createCommand('createUser', {
    firstname: 'Ada',
    lastname: 'Lovelace',
    email: 'ada@example.com',
});
const { envelope, result, results } = await commandBus.dispatch(intent);
// result  = last handler's return value (undefined if none ran)
// results = every handler's return value (use this on event/fan-out buses)
// envelope.stampsOfType('missive:handled') etc. to inspect metadata
```

Queries and events follow the identical shape — swap `CommandHandlerDefinition` →
`QueryHandlerDefinition` / `EventHandlerDefinition`, `createCommandBus` → `createQueryBus` /
`createEventBus`, and `createCommand` → `createQuery` / `createEvent`. **The contract's input key
must match the bus kind** (`command` / `query` / `event`).

## Why this is the recipe (and great for AI-assisted work)

- The **contract is the spec**. Once `CreateUserHandlerDefinition` exists, the compiler derives the
  argument and return types of `register`, `createCommand`, `dispatch`, and the handler itself — so
  an implementation that drifts from the spec fails to typecheck.
- The **only seam is `createXHandler(deps)`**. Business logic is a plain function behind a typed
  envelope; you implement the logic and wire real dependencies in exactly one place (the composition
  root). You never reach into bus internals to extend behavior.
- **Adapters are tiny interfaces** (2–3 async methods). "Write a Redis cache adapter" is one
  unambiguous, verifiable target — see `references/adapters-and-di.md`.
- **Cross-cutting concerns are middleware**, kept out of the business logic entirely.

## Highest-value correctness rules

These are the mistakes most likely to produce wrong-but-plausible code. Internalize them:

1. **`register(name, handler)` takes no schema.** Older docs show a third `Schema` argument — that
   API is gone. Runtime validation is a _separate_ concern: `useValidatorMiddleware({ intents: {...} })`
   with `input`/`output` predicates. The contract type is compile-time only; the validator is
   runtime. They are wired independently and **can drift — keep them in sync**.
2. **`result` vs `results`.** `dispatch()` returns both. `result` is the _last_ handler's value;
   `results` is _all_ of them. On an event bus (fan-out, many handlers) rely on `results`.
3. **A middleware that forgets `await next()` silently skips the handler.** And any middleware that
   adds a `missive:handled` stamp before the chain ends short-circuits the real handlers (this is
   how cacher/mocker/feature-flag work). **Registration order matters** — first registered is
   outermost.
4. **Creator names differ per bus:** `createCommand` / `createQuery` / `createEvent`. There is no
   generic `createIntent` on the bus object.
5. **`useCacherMiddleware` is query-bus-only; `useAsyncMiddleware` is command/event-only.**
6. **TTL units differ:** cacher `set` ttl is **seconds**; lock `acquire` ttl is **milliseconds**.
7. **Don't put a `__type` key in your payload** — the bus adds it when creating the intent.

## When to read each reference

- **`references/contracts-and-handlers.md`** — defining commands/queries/events, the registry,
  `register`/`createIntent`/`dispatch`, reading stamps, re-dispatch, errors. Read when scaffolding a
  feature or wiring buses.
- **`references/middlewares.md`** — the full built-in catalog with exact signatures, chain ordering,
  the short-circuit mechanism, per-intent config, and how to write a custom middleware. Read when
  adding validation, caching, logging, locking, retries, webhooks, flags, mocks, or async.
- **`references/adapters-and-di.md`** — the adapter contracts (cache, lock, logger), how to supply
  your own (e.g. Redis/Postgres), TTL units, fencing tokens, and the dependency-injection seam. Read
  when integrating real infrastructure.
- **`references/patterns.md`** — project structure, the vertical-slice recipe in full, the
  events-via-stamps pattern, the barrel file, testing, and the step-by-step AI-assisted workflow.
  Read when laying out a project or deciding _where_ code goes.

When in doubt about an exact signature, read the source under `libs/missive.js/src/` (the engine is
`core/bus.ts`) — it is small and the source is the contract.
