export type LockAdapter = {
    acquire: (key: string, ttl: number) => Promise<boolean>;
    release: (key: string) => Promise<void>;
};
