import { Middleware } from 'missive.js';

export const createLoggerMiddleware = (): Middleware<any, any> => async (envelope, next) => {
    console.log('Logger Middleware: Message Received', envelope.message);
    await next();
    console.log('Logger Middleware: Message Handled', envelope.message);
};
