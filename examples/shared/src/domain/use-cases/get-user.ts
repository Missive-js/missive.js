import { Envelope, QueryHandlerDefinition } from 'missive.js';
import { CacheableStamp } from 'missive.js';
import { z } from 'zod';

type Deps = {};

export const getUserQuerySchema = z.object({
    email: z.string().optional(),
    login: z.string().optional(),
    userId: z.string().optional(),
});
type Query = z.infer<typeof getUserQuerySchema>;
type Result = Awaited<ReturnType<typeof handler>>;

export type GetUserHandlerDefinition = QueryHandlerDefinition<'getUser', Query, Result>;
const sleep = (s: number) => new Promise((r) => setTimeout(r, s * 1000));

const handler = async (envelope: Envelope<Query>, deps: Deps) => {
    const { login, email, userId } = envelope.message;
    console.log(`Get User Handler: Getting User with login ${login} or email ${email} or userId ${userId}`);

    await sleep(4);
    envelope.addStamp<CacheableStamp>('missive:cacheable', { ttl: 1800 });
    return {
        success: true,
        nickname: 'plopix',
        user: {
            id: '1234',
            email: 'plopix@example.com',
        },
    };
};
export const createGetUserHandler = (deps: Deps) => (query: Envelope<Query>) => handler(query, deps);
