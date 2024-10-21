import { queryBus, commandBus } from 'missive.js-shared-code-example';

const getUserQuery = queryBus.createIntent('getUser', { email: 'plopix@example.com' });
const { result: user } = await queryBus.dispatch(getUserQuery);

console.log({ user });

const createUserCommand = commandBus.createIntent('createUser', {
    email: 'plopix@example.com',
    firstname: 'Plopix',
    lastname: 'ix',
});
const { result } = await commandBus.dispatch(createUserCommand);
console.log(result);

const removeUserCommand = commandBus.createIntent('removeUser', { userId: '1234' });
const { result: result2 } = await commandBus.dispatch(removeUserCommand);

console.log({ result2 });
