# Patterns & project structure

How to lay out a missive.js application, where code goes, and the recurring patterns — including the
one piece of glue most newcomers miss (events). These mirror the official `examples/shared` layout.

## Table of contents

- [Project structure](#project-structure)
- [The vertical-slice recipe](#vertical-slice-recipe)
- [The composition root](#composition-root)
- [Commands raising events (the key pattern)](#commands-raising-events)
- [Keeping schemas and contracts in sync](#schemas-in-sync)
- [Testing](#testing)
- [The AI-assisted workflow](#ai-workflow)

## Project structure

A typical layout separates domain logic from wiring:

```
src/
├── domain/
│   ├── use-cases/        # one file per command/query/event (the vertical slices)
│   │   ├── create-user.ts
│   │   ├── get-user.ts
│   │   └── user-created.ts
│   ├── contracts/
│   │   └── bus.ts        # registries (intersections of definitions) + aliased bus types
│   └── middlewares/
│       └── events.ts     # custom middleware (e.g. the events bridge)
└── core/
    └── buses.server.ts   # the composition root: create buses, attach middleware, register handlers
```

The domain files never import the composition root; the composition root imports them. This keeps
business logic free of wiring and makes each slice independently testable.

## Vertical-slice recipe

To **add a feature**, do these five mechanical steps (see `references/contracts-and-handlers.md` for
the full code of step 1):

1. Create `domain/use-cases/<name>.ts`: schema → `type Input = z.infer<...>` →
   `type Result = Awaited<ReturnType<typeof handler>>` → `export type XHandlerDefinition` → `handler`
   → `export const createXHandler = (deps) => (envelope) => handler(envelope, deps)`.
2. In `domain/contracts/bus.ts`, intersect the new definition into the right registry
   (`CommandHandlerRegistry & XHandlerDefinition`).
3. In the composition root, `register('<name>', createXHandler({ ...real deps }))`.
4. Add runtime validation: a `useValidatorMiddleware` `intents` entry referencing the slice's schema.
5. Dispatch from your app: `bus.createCommand('<name>', payload)` then `await bus.dispatch(...)`.

Steps 1–4 are the same shape every time, which is exactly why this is comfortable to delegate to an
agent: the only varying parts are the schema, the deps, and the handler body.

## Composition root

One module creates the buses and wires everything. Order of `useX`/`use` calls is the middleware
order (outermost first):

```typescript
import { createCommandBus } from 'missive.js';
import { CommandBus, CommandHandlerRegistry } from '../domain/contracts/bus.js';
import { createEventsMiddleware } from '../domain/middlewares/events.js';
import {
    createCreateUserHandler,
    createUserCommandSchema,
    createUserOutputSchema,
} from '../domain/use-cases/create-user.js';

const commandBus: CommandBus = createCommandBus<CommandHandlerRegistry>({
    middlewares: [createEventsMiddleware(eventBus)], // pre-loaded, runs around every command
});

commandBus.useValidatorMiddleware({
    intents: {
        createUser: {
            input: (m) => createUserCommandSchema.safeParse(m).success,
            output: (r) => createUserOutputSchema.safeParse(r).success,
        },
    },
});

commandBus.register('createUser', createCreateUserHandler({ userRepo, mailer }));

export { commandBus };
```

You can attach handlers/middleware either via the `createXBus({ handlers, middlewares })` argument or
via `register`/`use*` calls afterwards — pick one style and stay consistent.

## Commands raising events

missive.js does **not** automatically send events when a command succeeds — and command handlers
should **not** call the event bus directly (that re-couples them). The idiomatic pattern is:

1. The command handler records its intent to emit an event by **adding a stamp**:

```typescript
// inside create-user.ts handler
envelope.addStamp<UserCreatedEventStamp>('event', { _type: 'userCreated', userId });
return { userId, success: true };
```

2. A small **custom middleware** runs the handler, then reads those stamps and dispatches them to the
   event bus:

```typescript
import { Middleware } from 'missive.js';
import { CommandHandlerRegistry, EventBus, UserCreatedEventStamp } from '../contracts/bus.js';

export const createEventsMiddleware =
    (eventBus: EventBus): Middleware<'command', CommandHandlerRegistry> =>
    async (envelope, next) => {
        await next(); // run the command first
        const eventStamps = envelope.stampsOfType<UserCreatedEventStamp>('event');
        for (const stamp of eventStamps) {
            if (stamp.body) {
                const event = eventBus.createEvent(stamp.body._type, { userId: stamp.body.userId });
                await eventBus.dispatch(event);
            }
        }
    };
```

3. Register it on the command bus (as a `middlewares` entry or `commandBus.use(...)`).

This keeps the command handler ignorant of the event bus — it only declares "a user was created"
via a stamp; the middleware decides what to do with that. **If you forget to register the events
middleware, events silently never fire** — a common gotcha.

Define the event stamp type next to the registries:

```typescript
import { Stamp } from 'missive.js';
export type UserCreatedEventStamp = Stamp<{ _type: 'userCreated'; userId: string }, 'event'>;
```

## Schemas in sync

The TypeScript contract (`XHandlerDefinition`) and the runtime schema (the Zod object referenced by
the validator) are declared in the same slice file but are **independent** — the compiler does not
check that they agree. Deriving `type Input = z.infer<typeof schema>` ties the _input_ type to the
schema, which is the recommended way to avoid drift. When you change one, change the other.

## Testing

Test a slice by dispatching through a bus — this exercises the handler exactly as production does,
including any middleware you attach. Inject fake deps via the factory:

```typescript
import { createCommandBus } from 'missive.js';

const fakeRepo = { create: async () => 'id-1' };

const bus = createCommandBus<CommandHandlerRegistry>();
bus.register('createUser', createCreateUserHandler({ userRepo: fakeRepo }));

const { result, results, envelope } = await bus.dispatch(
    bus.createCommand('createUser', { firstname: 'A', lastname: 'B', email: 'a@b.co' }),
);
// assert on `result`, or inspect `envelope.stampsOfType(...)` for emitted stamps
```

Two notes:

- The bus is the supported way to build an _Envelope_ — `createEnvelope` is internal and not exported,
  so don't try to construct an envelope by hand to call a handler directly. Go through `dispatch`.
- Use the **mocker middleware** to short-circuit a handler's result during local runs or tests
  without touching the handler (see `references/middlewares.md` → Mocker).

## AI workflow

The reason missive.js suits AI-assisted coding, as a concrete loop:

1. **Write the contract first** — the schema + `XHandlerDefinition`. This is the spec, and it is
   small and explicit.
2. **State the deps interface** — `type Deps = { ... }`. This is the seam the agent codes behind.
3. **Hand the agent the envelope type + the deps interface and ask for the handler body.** Because
   the input and result types are fixed by the contract, an implementation that drifts won't
   compile.
4. **Wire it in the composition root** — register the factory with real deps, add the validator
   entry.
5. **For infrastructure, ask for an adapter** — "implement a `CacherAdapter`/`LockAdapter` for X". A
   2–3 method contract is an unambiguous, individually-verifiable target.

The compiler is the agent's safety net: the contract types, the validator predicates, and the
adapter interfaces together turn "write some business logic" into a set of narrow, checkable tasks.
