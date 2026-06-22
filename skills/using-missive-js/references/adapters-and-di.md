# Adapters & dependency injection

missive.js has two dependency-injection seams. Both are plain TypeScript — no container, no
decorators, no reflection.

1. **Handler deps** — the business dependencies a handler needs (repositories, mailers, clients).
2. **Adapter deps** — the infrastructure a _middleware_ talks to (a cache store, a lock store, a log
   sink). Each is a small, structurally-typed interface you can implement with any object.

This is the part of the library that makes "hand the agent the interface, let it implement the
logic" work cleanly: every seam is a named type with a tiny, verifiable surface.

## Table of contents

- [Handler dependency injection](#handler-di)
- [Adapter interfaces are structural](#structural)
- [CacherAdapter](#cacher-adapter)
- [LockAdapter](#lock-adapter)
- [Logger: LoggerInterface vs LoggerAdapter](#logger)
- [Built-in in-memory defaults](#defaults)

## Handler DI

A handler is `(envelope, deps) => Promise<Result>`, wrapped by a factory that closes over the deps
and exposes the bus-shaped `(envelope) => Promise<Result>`:

```typescript
type Deps = { userRepo: UserRepo; mailer: Mailer };

const handler = async (envelope: Envelope<Command>, deps: Deps) => {
    const id = await deps.userRepo.create(envelope.message);
    await deps.mailer.sendWelcome(id);
    return { id };
};

export const createCreateUserHandler = (deps: Deps) => (command: Envelope<Command>) => handler(command, deps);
```

You inject the **real** deps once, in the composition root:

```typescript
commandBus.register('createUser', createCreateUserHandler({ userRepo, mailer }));
```

This is why the library is a good codegen target: the handler body is pure logic written against a
typed `Deps` interface and a typed `envelope.message`. To make a handler testable or runnable, you
swap what you pass to the factory — nothing else changes. (In tests, pass fakes; in production, pass
the real implementations.)

## Structural

Adapter contracts are **structurally typed** — _any object with the right method shapes is a valid
adapter_. There is no `implements`, no base class. A test can pass `{ get: vi.fn(), set: vi.fn() }`
and it type-checks.

Two consequences to remember:

- You can inline a throwaway adapter (e.g. an always-succeeds lock) without ceremony.
- A typo'd or extra method is **not** caught as long as the required methods match — so match the
  contract exactly.

> The contracts live in the **middleware** files, not the adapter files, and are re-exported from
> the package root. Import them from `'missive.js'`. There is no `CacheInterface`; the cache
> contract is `CacherAdapter`. The only `*Interface` is `LoggerInterface`.

## CacherAdapter

```typescript
export type CacherAdapter = {
    get: (key: string) => Promise<unknown | null>; // return null (not undefined) on a miss
    set: (key: string, value: unknown, ttl: number) => Promise<void>; // ttl is in SECONDS
};
```

The middleware hands you an opaque `value` to store and expects it back verbatim on a hit — your
adapter just round-trips it. A Redis implementation:

```typescript
import { CacherAdapter, createCacherMiddleware } from 'missive.js';
import type { Redis } from 'ioredis';

export const createRedisCacheAdapter = (redis: Redis): CacherAdapter => ({
    get: async (key) => {
        const raw = await redis.get(key);
        return raw === null ? null : JSON.parse(raw); // null on miss is required
    },
    set: async (key, value, ttl) => {
        await redis.set(key, JSON.stringify(value), 'EX', ttl); // ttl seconds → Redis EX seconds
    },
});

// wire it (query bus only):
queryBus.useCacherMiddleware({ adapter: createRedisCacheAdapter(redis) });
```

The bundled `createMemoryCacheAdapter()` is the reference implementation: a `Map` keyed by the
cache key, expiring at `Date.now() + ttl * 1000` (confirming **ttl seconds**), returning `null` and
deleting the entry on expiry.

## LockAdapter

```typescript
export type LockAdapter = {
    acquire: (key: string, ttl: number, token: string) => Promise<boolean>; // ttl ms; false (don't throw) if held
    release: (key: string, token: string) => Promise<void>; // release only if token matches
};
```

- **ttl is milliseconds** (the lock middleware defaults to 500). Contrast the cacher's seconds.
- `acquire` returns **`false`** when the key is held and unexpired — it must not throw; the
  middleware handles the retry/timeout loop.
- `release` must honor the **fencing token**: only delete the lock if the stored token matches, so a
  late release from a previous holder can't free someone else's lock.

A Redis implementation using `SET NX PX` + a token-checked release:

```typescript
import { LockAdapter, createLockMiddleware } from 'missive.js';
import type { Redis } from 'ioredis';

export const createRedisLockAdapter = (redis: Redis): LockAdapter => ({
    acquire: async (key, ttl, token) => {
        const ok = await redis.set(key, token, 'PX', ttl, 'NX'); // ttl ms → Redis PX ms
        return ok === 'OK';
    },
    release: async (key, token) => {
        // atomic compare-and-delete so we only release our own lock
        await redis.eval(
            "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
            1,
            key,
            token,
        );
    },
});

commandBus.useLockMiddleware({
    adapter: createRedisLockAdapter(redis),
    getLockKey: async (envelope) => envelope.message.email,
});
```

The bundled `createInMemoryLockAdapter()` is the reference (a `Map` storing `{ expiresAt, token }`),
**not safe across processes** — fine for a single instance or tests, use Redis/DB for distributed
locking.

## Logger

Logging has two levels of DI, so you can control either _where_ logs go or _how_ envelopes are
formatted:

```typescript
// the raw sink — where bytes go (console-compatible; pino/winston fit too)
export type LoggerInterface = {
    log: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
};

// the formatter — how an envelope is rendered into log calls
export type LoggerAdapter = {
    processing: LogFunction; // before the handler
    processed: LogFunction; // after success
    error: LogFunction; // on failure
};
type LogFunction = <M, R>(
    identity: IdentityStamp | undefined,
    message: M,
    results: HandledStamp<R>[],
    stamps: Stamp[],
) => void | Promise<void>;
```

Three ways to use it, simplest first:

```typescript
// 1. nothing → logs to console with the default formatter
bus.useLoggerMiddleware();

// 2. inject a sink → keep default formatting, send bytes elsewhere
bus.useLoggerMiddleware({ logger: pino() });

// 3. inject a full adapter → control the output format (createLoggerAdapter wraps a sink into one)
import { createLoggerAdapter } from 'missive.js';
bus.useLoggerMiddleware({ adapter: createLoggerAdapter({ logger: pino(), serializer: JSON.stringify }) });
```

If you pass `adapter`, it owns formatting (any `logger` you also pass is then ignored for
formatting). The default adapter prints `[Envelope<id>](Processing|Processed|Errored)` and reads the
`missive:timings` stamp to append `in N ms`.

## Defaults

Every adapter-backed middleware works with **zero configuration** — omit `adapter` and you get an
in-memory implementation, so you can build and run before wiring real infrastructure:

| Middleware | Default adapter                            | Production swap                                       |
| ---------- | ------------------------------------------ | ----------------------------------------------------- |
| Cacher     | `createMemoryCacheAdapter()`               | Redis/Memcached/etc. → `CacherAdapter`                |
| Lock       | `createInMemoryLockAdapter()`              | Redis/DB → `LockAdapter` (must be cross-process safe) |
| Logger     | `createLoggerAdapter({ logger: console })` | inject your `logger` or a full `LoggerAdapter`        |

The agent-friendly recipe: **build against the in-memory default, then replace it with a real
adapter that satisfies the same 2–3 method contract** — no other code changes.
