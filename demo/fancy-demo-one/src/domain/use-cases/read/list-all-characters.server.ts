import { drizzle } from 'drizzle-orm/libsql';
import { Envelope, QueryHandlerDefinition } from 'missive.js';
import { z } from 'zod';
import { characters } from '~/db/schema';

type Deps = {
    db: ReturnType<typeof drizzle>;
};

export const ListAllCharactersQuerySchema = z.object({});
type Query = z.infer<typeof ListAllCharactersQuerySchema>;
type Result = Awaited<ReturnType<typeof handler>>;

export type ListAllCharactersHandlerDefinition = QueryHandlerDefinition<'ListAllCharacters', Query, Result>;

const handler = async (envelope: Envelope<Query>, { db }: Deps) => {
    const items = await db.select().from(characters).all();
    return items;
};
export const createListAllCharactersHandler = (deps: Deps) => (query: Envelope<Query>) => handler(query, deps);
