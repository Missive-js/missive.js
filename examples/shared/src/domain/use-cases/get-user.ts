import { Envelope } from 'missive.js';
import { z } from 'zod';

type Deps = {};

const getUserQueryType = 'getUser' as const;
export const getUserQuerySchema = z.object({
    email: z.string().optional(),
    login: z.string().optional(),
    userId: z.string().optional(),
});
type Query = z.infer<typeof getUserQuerySchema>;
type Result = Awaited<ReturnType<typeof handler>>;
export type GetUserHandlerDefinition = {
    [getUserQueryType]: {
        query: Query;
        result: Result;
    };
};
const handler = async (envelope: Envelope<Query>, deps: Deps) => {
    const { login, email, userId } = envelope.message;
    console.log(`Get User Handler: Getting User with login ${login} or email ${email} or userId ${userId}`);
    return {
        success: true,
        user: {
            id: '1234',
            email: 'plopix@example.com',
        },
    };
};
export const createGetUserHandler = (deps: Deps) => (query: Envelope<Query>) => handler(query, deps);
