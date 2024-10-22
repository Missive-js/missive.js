import { GenericMiddleware } from 'missive.js';

export const createLoggerMiddleware = (): GenericMiddleware => async (envelope, next) => {
    console.log('Logger Middleware: Message Received', envelope.message);
    await next();
    console.log('Logger Middleware: Message Handled', envelope.message);
};
