# Middlewares

Middleware is missive.js's only extension mechanism. A middleware is
`(envelope, next) => Promise<void>` (`Middleware<BusKind, Registry>`). It can read/mutate the
envelope, add stamps, run code before and after the handler, short-circuit the handler, or even run
the downstream chain more than once.

## Table of contents

- [How middleware runs (the onion)](#the-onion)
- [Adding middleware to a bus](#adding-middleware)
- [Per-intent configuration](#per-intent-config)
- [The built-in catalog](#the-catalog)
- [Validator — where runtime schemas live](#validator)
- [Cacher](#cacher) · [Logger](#logger) · [Lock](#lock) · [Retryer](#retryer) · [Webhook](#webhook) · [Feature flag](#feature-flag) · [Mocker](#mocker) · [Async](#async)
- [Writing a custom middleware](#custom-middleware)

## The onion

```
use(A); use(B); use(C); register(handler)

dispatch →  A before → B before → C before → [handler] → C after → B after → A after
```

- **Registration order = execution order on the way in. First registered is outermost.**
- Code after `await next()` runs on the way **out**, in reverse order.
- **Forgetting `await next()` skips everything downstream**, including the handler — a silent bug.
- A middleware may call `next()` **more than once** (the retryer does) — each call re-runs the rest
  of the chain from that middleware's position.
- **Short-circuit:** if, when the chain reaches the end, a `missive:handled` stamp already exists,
  the engine **skips the real handlers**. Adding that stamp from a middleware is the supported way
  to serve a precomputed result (cacher, mocker, and feature-flag fallback all do this).

## Adding middleware

Two equivalent ways:

```typescript
bus.use(myMiddleware);                 // any Middleware<BusKind, Registry>
bus.useValidatorMiddleware({ ... });   // typed sugar for a built-in (calls bus.use under the hood)
```

The `useXMiddleware` sugar exists on every bus, with two kind-specific exceptions:

- **`useCacherMiddleware` — query bus only** (caching reads; it needs the bus reference for
  stale-while-revalidate).
- **`useAsyncMiddleware` — command and event buses only.**

## Per-intent config

Almost every built-in accepts an `intents` map keyed by message name, so behavior is configured
per message (with a top-level default where it makes sense):

```typescript
bus.useValidatorMiddleware({
    intents: {
        createUser: { input: (m) => createUserSchema.safeParse(m).success },
        removeUser: { input: (m) => removeUserSchema.safeParse(m).success },
    },
});
```

## The catalog

| Middleware   | Sugar (bus method)                     | One-line purpose                                                                    |
| ------------ | -------------------------------------- | ----------------------------------------------------------------------------------- |
| Validator    | `useValidatorMiddleware`               | Per-intent input/output predicate validation. **Where Zod/runtime schemas attach.** |
| Logger       | `useLoggerMiddleware`                  | Logs processing/processed/error around the handler; adds a timings stamp.           |
| Cacher       | `useCacherMiddleware` _(query only)_   | Caches query results; stale-while-revalidate; short-circuits on hit.                |
| Lock         | `useLockMiddleware`                    | Mutex/distributed lock around the handler via a fencing token.                      |
| Retryer      | `useRetryerMiddleware`                 | Retries the handler on error with backoff.                                          |
| Webhook      | `useWebhookMiddleware`                 | Sends the envelope to endpoint(s) (per-endpoint HTTP method) after the handler.     |
| Feature flag | `useFeatureFlagMiddleware`             | Gates an intent; runs a fallback or throws when disabled.                           |
| Mocker       | `useMockerMiddleware`                  | Replaces the handler result for an intent (testing/local).                          |
| Async        | `useAsyncMiddleware` _(command/event)_ | Fire-and-forget producer: hand the message to a queue instead of running it now.    |

Signatures below are the factory forms; the `useX` sugar takes the same options object.

### Validator

Runtime validation lives here — **not on `register`**. `input` runs before the handler, `output`
after. A failing predicate throws `MissiveMiddlewareError('validator', 'Invalid message' | 'Invalid result')`.

```typescript
createValidatorMiddleware<BusKind, T>(input?: {
    intents?: { [K in keyof T]?: {
        input?:  (message: T[K][BusKind]) => boolean;
        output?: (result: T[K]['result'] | undefined) => boolean;
    } };
}): Middleware<BusKind, T>
```

```typescript
commandBus.useValidatorMiddleware({
    intents: {
        createUser: {
            input: (message) => createUserCommandSchema.safeParse(message).success,
            output: (result) => createUserOutputSchema.safeParse(result).success,
        },
    },
});
```

> The contract gives **compile-time** safety; the validator gives **runtime** safety. They are
> declared in different places and **can drift** — when you change a schema, update the matching
> definition (and vice-versa).

### Cacher

Query bus only. Keys cache entries by SHA-256 of `JSON.stringify(message)`. With the default
`cache: 'all'`, `useCacherMiddleware()` caches **every** successful result (ttl defaults to 3600s) —
caching is opt-**out**. Switch to `cache: 'only-cacheable'` to make it opt-in, where only queries
that stamp `missive:cacheable` are cached.

```typescript
createCacherMiddleware<T>({
    adapter?,                 // default: in-memory (createMemoryCacheAdapter())
    intents?,                 // per-intent ttl/stale overrides
    cache?: 'all' | 'only-cacheable',  // default 'all'
    defaultTtl?: number,      // seconds, default 3600
    defaultStaleTtl?: number, // seconds, default 60 (0 disables stale-while-revalidate)
    shortCircuit?: boolean,   // default true — serve from cache and skip the handler
    onRevalidationError?,
}): Middleware<'query', T>
```

How an entry gets cached:

- With `cache: 'all'` (default), every successful result is cached using its ttl (default 3600s).
- A handler can override the ttl (or, under `cache: 'only-cacheable'`, opt the query in at all) by
  stamping from inside itself: `envelope.addStamp<CacheableStamp>('missive:cacheable', { ttl: 1800 })`.
  Under `cache: 'only-cacheable'`, _only_ queries that add this stamp are cached.

Gotchas: the custom adapter's `set` ttl is in **seconds**; `get` must return `null` (not
`undefined`) on a miss; results are not cached if the envelope carries an `'error'` stamp or ttl
resolves to 0; stale-while-revalidate only runs when `defaultStaleTtl > 0` **and** the bus reference
is present (the `useCacherMiddleware` sugar injects it automatically; calling the factory directly
does not). See `references/adapters-and-di.md` for the `CacherAdapter` shape.

### Logger

```typescript
createLoggerMiddleware<BusKind, T>({
    adapter?,           // a LoggerAdapter (formatter). Mutually exclusive with `logger`.
    logger?,            // a LoggerInterface (raw sink, e.g. console/pino). Wrapped automatically.
    intents?,           // per-intent { collect?, async? }
    collect?: boolean,  // default false — defer + snapshot stamps until the end
    async?: boolean,    // default false — fire-and-forget logging
}?): Middleware<BusKind, T>
```

```typescript
bus.useLoggerMiddleware(); // logs to console by default
bus.useLoggerMiddleware({ logger: pino() }); // raw sink
bus.useLoggerMiddleware({ intents: { userCreated: { async: true } } });
```

Adds a `missive:timings` stamp (`total` in **nanoseconds**). See adapters ref for `LoggerAdapter`
vs `LoggerInterface`.

### Lock

```typescript
createLockMiddleware<BusKind, T>({
    adapter?,                                 // default: in-memory (NOT cross-process safe)
    getLockKey: (envelope) => Promise<string>, // required — derive the lock key from the message
    ttl?: number,      // milliseconds, default 500
    timeout?: number,  // ms to keep trying before throwing, default 5000
    tick?: number,     // ms between acquire attempts, default 100
    intents?,          // per-intent getLockKey/ttl/timeout/tick overrides
}): Middleware<BusKind, T>
```

```typescript
commandBus.useLockMiddleware({
    getLockKey: async (envelope) => envelope.message.__type,
    intents: {
        createUser: { getLockKey: async (envelope) => envelope.message.email, timeout: 2000, ttl: 500, tick: 100 },
    },
});
```

Spins `acquire` every `tick` ms until acquired or `timeout` (then throws
`'Lock not acquired or timeout'`); releases in a `finally`. **Lock ttl is milliseconds** (contrast
the cacher's seconds). The adapter must honor a fencing token — see adapters ref.

### Retryer

```typescript
createRetryerMiddleware<BusKind, T>(options?: {
    maxAttempts?: number,                                  // default 3
    waitingAlgorithm?: 'exponential' | 'fibonacci' | 'none',
    multiplier?: number,
    jitter?: number,
    intents?,
}): Middleware<BusKind, T>
```

Retries `next()` when the handler **throws** _or_ when a new `'error'` stamp appears. Adds a
`missive:retried` stamp `{ attempt, errorMessage }` per retry. Rethrows the last error when attempts
are exhausted (note: if failures came only via `'error'` stamps with no throw, it returns normally
after exhausting).

### Webhook

```typescript
createWebhookMiddleware<BusKind, T>(options?: {
    async?: boolean,     // fire-and-forget
    parallel?: boolean,  // hit endpoints in parallel vs sequentially
    endpoints: WebhookEndpoint[],
    fetcher?: typeof fetch,
    intents?,
    // ...RetryConfiguration (maxAttempts, waitingAlgorithm, multiplier, jitter)
}): Middleware<BusKind, T>

type WebhookEndpoint = {
    url: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    headers: Record<string, string>;
    signatureHeader: string;
    signature: (payload: string) => string;
};
```

Runs `next()` **first** (so it sees the handler result), then sends an HTTP request to each endpoint
using that endpoint's configured `method`, with the JSON-stringified envelope as the body. Records
`missive:webhook-called` stamps only when `async: false`.

### Feature flag

```typescript
createFeatureFlagMiddleware<BusKind, T>({
    featureFlagChecker: (intent: keyof T) => Promise<boolean>,
    intents,  // required; per-intent { fallbackHandler, shortCircuit? }
}): Middleware<BusKind, T>
```

If the flag is on, runs the handler. If off: runs the per-intent `fallbackHandler` (which stamps
`missive:handled` + `missive:feature-flag-fallback`, and by default `shortCircuit: true` skips the
real handler); if there is no fallback, it **throws**. Set `shortCircuit: false` to also run the
real handler after the fallback.

### Mocker

```typescript
createMockerMiddleware<BusKind, T>({
    intents: { [K in keyof T]?: (envelope) => Promise<T[K]['result']> },
}): Middleware<BusKind, T>
```

If a mock exists for the intent, runs it and stamps `missive:handled` (skipping the real handler),
then still calls `next()`. Great for local dev and tests.

### Async

Command and event buses only. Turns a dispatch into a producer: instead of running the handler now,
it stamps `missive:async`, calls `produce(envelope)` (push to your queue), and returns **without**
`next()`. A consumer later re-dispatches the envelope to actually run the handler.

```typescript
createAsyncMiddleware<'command' | 'event', T>({
    consume: boolean,                       // false on the producer side
    produce: (envelope) => Promise<void>,   // push to queue
    async?: boolean,                        // default true
    intents?,                               // per-intent produce/async overrides
}): Middleware<'command' | 'event', T>
```

```typescript
commandBus.useAsyncMiddleware({
    consume: false,
    async: false, // the `async` option defaults to true; disabled here and re-enabled per-intent
    produce: async (envelope) => myQueue.push(envelope),
    intents: { createUser: { async: true, produce: async (envelope) => myQueue.push(envelope) } },
});
```

## Custom middleware

Cross-cutting behavior the built-ins don't cover is just a function. Type it with the bus kind and
registry so the envelope is typed:

```typescript
import { Middleware } from 'missive.js';
import { CommandHandlerRegistry } from '../contracts/bus.js';

export const timingGuard: Middleware<'command', CommandHandlerRegistry> = async (envelope, next) => {
    const start = performance.now();
    await next(); // ALWAYS call next unless you intend to short-circuit
    const ms = performance.now() - start;
    envelope.addStamp('app:timing', { ms });
};
```

The most important real-world custom middleware is the **events dispatcher** that bridges the
command bus to the event bus via stamps — see `references/patterns.md`.
