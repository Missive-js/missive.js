import { createContainer, InjectionMode, asFunction, asValue } from 'awilix';
import type { Logger } from '~/domain/contracts/logger';
import { createLogger } from '~/infrastructure/create-logger.server';
import { createCommandBus, createEventBus, createQueryBus } from 'missive.js';
import {
    CommandBus,
    CommandDefitions,
    EventBus,
    EventDefitions,
    QueryBus,
    QueryDefitions,
} from '~/domain/contracts/bus';
import { drizzle } from 'drizzle-orm/libsql';
import {
    createListAllCharactersHandler,
    ListAllCharactersQuerySchema,
} from '~/domain/use-cases/read/list-all-characters.server';
import { DefaultLogger } from 'drizzle-orm/logger';
import { AddCharacterCommandSchema, createAddCharacterHandler } from '~/domain/use-cases/write/add-character.server';
import { AddQuestCommandSchema, createAddQuestHandler } from '~/domain/use-cases/write/add-quest.server';
import { createListAllQuestsHandler, ListAllQuestsQuerySchema } from '~/domain/use-cases/read/list-all-quests.server';
import { EventEmitter } from 'events';
import { createMemoryStorage } from '~/infrastructure/create-memory-storage.server';

export const buildContainer = () => {
    const logger = createLogger(['info', 'debug']);
    const dLogger = new DefaultLogger({ writer: { write: logger.debug } });
    const db = drizzle({
        connection: { url: process.env.DB_FILE_NAME! },
        logger: dLogger,
    });
    const emitter = new EventEmitter();
    const container = createContainer<{
        logger: Logger;
        queryBus: QueryBus;
        commandBus: CommandBus;
        eventBus: EventBus;
        db: typeof db;
        emitter: typeof emitter;
        listAllCharactersQueryHandler: ReturnType<typeof createListAllCharactersHandler>;
        listAllQuestsQueryHandler: ReturnType<typeof createListAllQuestsHandler>;
        addCharacterCommandHandler: ReturnType<typeof createAddCharacterHandler>;
        addQuestCommandHandler: ReturnType<typeof createAddQuestHandler>;
        busObsName: string;
    }>({
        injectionMode: InjectionMode.PROXY,
        strict: true,
    });

    container.register({
        logger: asValue(logger),
        emitter: asValue(emitter),
        queryBus: asFunction(() => createQueryBus<QueryDefitions>()).singleton(),
        commandBus: asFunction(() => createCommandBus<CommandDefitions>()).singleton(),
        eventBus: asFunction(() => createEventBus<EventDefitions>()).singleton(),
        listAllCharactersQueryHandler: asFunction(createListAllCharactersHandler).singleton(),
        addCharacterCommandHandler: asFunction(createAddCharacterHandler).singleton(),
        listAllQuestsQueryHandler: asFunction(createListAllQuestsHandler).singleton(),
        addQuestCommandHandler: asFunction(createAddQuestHandler).singleton(),
        db: asValue(db),
        busObsName: asValue('bus-obs'),
    });

    const memoryStorage = createMemoryStorage({
        prefix: 'missive-demo-query-bus',
    });

    // Query Bus
    const simpleLogger = { log: container.cradle.logger.info, error: container.cradle.logger.error };
    const observabilityLogger = {
        log: (...args: unknown[]) => {
            emitter.emit(container.cradle.busObsName, ['query', ...args]);
        },
        error: (...args: unknown[]) => {
            emitter.emit(container.cradle.busObsName, ['query', ...args]);
        },
    };

    container.cradle.queryBus.useLoggerMiddleware({ logger: observabilityLogger });
    container.cradle.queryBus.useLoggerMiddleware({ logger: simpleLogger });
    container.cradle.queryBus.useCacherMiddleware({
        adapter: memoryStorage,
        shortCircuit: true,
        defaultTtl: 40,
        intents: {
            ListAllCharacters: { shortCircuit: true },
        },
    });
    container.cradle.queryBus.register('ListAllCharacters', container.cradle.listAllCharactersQueryHandler);
    container.cradle.queryBus.register('ListAllQuests', container.cradle.listAllQuestsQueryHandler);

    // Command Bus
    container.cradle.commandBus.useLoggerMiddleware({ logger: observabilityLogger });
    container.cradle.commandBus.useLoggerMiddleware({ logger: simpleLogger });
    container.cradle.commandBus.register('AddCharacter', container.cradle.addCharacterCommandHandler);
    container.cradle.commandBus.register('AddQuest', container.cradle.addQuestCommandHandler);

    // Event Bus
    container.cradle.eventBus.useLoggerMiddleware({ logger: simpleLogger });
    return container;
};
