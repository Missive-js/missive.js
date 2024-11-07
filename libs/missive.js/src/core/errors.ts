export class MissiveMiddlewareError extends Error {
    constructor(middlewareName: string, message: string, envelope?: unknown, error?: unknown) {
        super(`missive.js: [middleware: ${middlewareName}]: ${message}`, { cause: { envelope, error } });
    }
}
