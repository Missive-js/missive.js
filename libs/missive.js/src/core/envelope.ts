export type Envelope<T> = {
    stamps: Stamp[];
    message: T;
    addStamp: <S extends Stamp>(type: S['type'], body?: S['body']) => void;
    firstStamp: <S extends Stamp>(type: S['type']) => S | undefined;
    lastStamp: <S extends Stamp>(type: S['type']) => S | undefined;
    stampsOfType: <S extends Stamp>(type: S['type']) => S[];
};

export type Stamp<C = unknown, T extends string = string> = {
    type: T;
    body?: C;
    date: Date;
};

export type IdentityStamp = Stamp<{ id: string }, 'missive:identity'>;
export type HandledStamp<R> = Stamp<R, 'missive:handled'>;

export const createEnvelope = <T>(message: T): Envelope<T> => {
    const stamps: Stamp[] = [];
    return {
        stamps,
        message,
        addStamp: <S extends Stamp>(type: S['type'], body?: S['body']) => {
            stamps.push({ type, body, date: new Date() });
        },
        stampsOfType: <S extends Stamp>(type: S['type']) => {
            return stamps.filter((stamp) => stamp.type === type) as S[];
        },
        firstStamp: <S extends Stamp>(type: S['type']) => {
            return stamps.find((stamp) => stamp.type === type) as S;
        },
        lastStamp: <S extends Stamp>(type: S['type']) => {
            return [...stamps].reverse().find((stamp) => stamp.type === type) as S;
        },
    };
};
