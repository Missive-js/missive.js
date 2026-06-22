# Changelog

All notable changes to `missive.js` are documented here. This project adheres to
[Semantic Versioning](https://semver.org/). Releases before `1.0.0` are recorded as git tags.

## 1.0.0

First stable release. This version fixes a number of correctness and concurrency bugs across the
middlewares and hardens the locking model. It contains **one breaking change** to the `LockAdapter`
interface.

### Breaking

- **`LockAdapter` now uses a fencing token.** `acquire` and `release` take an extra `token: string`
  argument:

    ```ts
    type LockAdapter = {
        acquire: (key: string, ttl: number, token: string) => Promise<boolean>;
        release: (key: string, token: string) => Promise<void>;
    };
    ```

    The lock middleware now generates a unique token per acquisition and only releases a lock whose
    token still matches, so a handler that outlives its TTL can no longer release a lock that another
    worker has since acquired. **If you ship a custom `LockAdapter` (e.g. Redis), add the `token`
    parameter and compare it on `release`.** Built-in usage (`createLockMiddleware`,
    `createInMemoryLockAdapter`) is unchanged.

### Fixed

- **Core dispatch / retryer:** middlewares registered after the retryer were skipped on every retry
  attempt because the chain advanced a single shared cursor. Each `next()` now re-enters the rest of
  the chain from the calling middleware's position, so retries correctly re-run the downstream
  middlewares (locks, validators, loggers) and the handler.
- **Retryer & Webhook:** the backoff `Sleeper` was created once and shared across all dispatches, so
  concurrent dispatches of the same message corrupted each other's backoff schedule. A fresh sleeper
  is now built per dispatch.
- **Webhook:** endpoints configured at the top level (not under `intents`) were silently ignored and
  fired no requests. They now fall back correctly.
- **Webhook (parallel):** after a retry round, results were attributed to the wrong endpoints and
  successful retries could be reported as failures. Each endpoint now keeps a stable result slot, and
  only failed endpoints are retried.
- **Webhook (sequential):** a single attempt counter was shared across all endpoints, starving later
  endpoints of retries. Each endpoint now gets its own attempt budget and backoff schedule.
- **Lock:** `release` could free a lock held by a different worker after a TTL expiry (see the
  breaking change above).
- **Cacher:** a failed pass that reported an `error` stamp was cached and served as a valid result.
  Such passes are no longer cached.
- **Cacher:** concurrent first-time ("cold") lookups for the same key all ran the handler (cache
  stampede). Cold fills are now coalesced so the handler runs once and the others serve the filled
  value.
- **Logger (`collect` mode):** the `processing` log was deferred to `finally`, so it rendered the
  post-processing envelope. It now captures the pre-`next()` state.
- **Validator:** the `input` validator's `message` parameter is now correctly typed with the
  `__type` discriminator, matching the other middlewares.

### Added

- **Cacher:** optional `onRevalidationError(error)` callback so stale-while-revalidate failures are
  observable instead of silently swallowed.

### Changed

- `maxAttempts` and `ttl` resolution now uses `??` instead of `||`, so an explicit `0` is respected
  rather than coerced to the default.
