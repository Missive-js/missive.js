import { queryBus, commandBus } from 'missive.js-shared-code-example';

const getUserQuery = queryBus.createQuery('getUser', { email: 'plopix@example.com' });
const { result: user } = await queryBus.dispatch(getUserQuery);

console.log({ user });

console.log('-------------------');

const getUserQuery2 = queryBus.createQuery('getUser', { email: 'plopix@example.com' });
const { result: user2 } = await queryBus.dispatch(getUserQuery2);

console.log({ user2 });

console.log('-------------------');

const createUserCommand = commandBus.createCommand('createUser', {
    email: 'plopix@example.com',
    firstname: 'Plopix',
    lastname: 'ix',
});
const { result } = await commandBus.dispatch(createUserCommand);
console.log(result);

console.log('-------------------');

const removeUserCommand = commandBus.createCommand('removeUser', { userId: '1234' });
const { result: result2 } = await commandBus.dispatch(removeUserCommand);

console.log({ result2 });
console.log('-------------------');
