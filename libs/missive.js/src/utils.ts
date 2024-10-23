export type Prettify<T> = {
    [K in keyof T]: T[K];
};

export type ReplaceKeys<T, K extends { [key: string]: keyof T }> = {
    [P in keyof T as P extends K[keyof K] ? { [Q in keyof K]: K[Q] extends P ? Q : never }[keyof K] : P]: T[P];
};
