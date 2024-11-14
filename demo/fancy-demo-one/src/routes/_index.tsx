import { LoaderFunctionArgs } from '@remix-run/node';
import { Form, useLoaderData } from '@remix-run/react';

export const loader = async ({ context }: LoaderFunctionArgs) => {
    const getCharactersIntent = context.createQuery('ListAllCharacters', {});
    const getQuestsIntent = context.createQuery('ListAllQuests', {});

    const characters = await context.dispatchQuery(getCharactersIntent);
    const quests = await context.dispatchQuery(getQuestsIntent);
    return {
        characters: characters.result || [],
        quests: quests.result || [],
    };
};
export const action = async ({ request, context }: LoaderFunctionArgs) => {
    const post = await request.formData();

    const action = post.get('action') as string;
    switch (action) {
        case 'add-character': {
            const intent = context.createCommand('AddCharacter', {
                name: `${post.get('name') || 'Unknown'}`,
            });
            const character = await context.dispatchCommand(intent);
            return { character };
        }
        case 'add-quest': {
            const intent = context.createCommand('AddQuest', {
                title: `${post.get('title') || 'Unknown'}`,
            });
            const character = await context.dispatchCommand(intent);
            return { character };
        }
        default:
            throw new Error(`Unknown action: ${action}`);
    }
};

export default function Index() {
    const { characters, quests } = useLoaderData<typeof loader>();
    return (
        <main className="p-10">
            <h1 className="text-4xl">Hero Quest Manager</h1>

            <div className="mt-10 flex justify-evenly">
                <div>
                    <h2 className="text-3xl">Characters</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Name</th>
                                <th>Class</th>
                                <th>Level</th>
                                <th>Experience</th>
                                <th>Strength</th>
                                <th>Agility</th>
                                <th>Magic</th>
                                <th>Retired</th>
                            </tr>
                        </thead>
                        <tbody>
                            {characters.map((character) => (
                                <tr key={character.id}>
                                    <td>{character.id}</td>
                                    <td>{character.name}</td>
                                    <td>{character.class}</td>
                                    <td>{character.level}</td>
                                    <td>{character.experience}</td>
                                    <td>{character.strength}</td>
                                    <td>{character.agility}</td>
                                    <td>{character.magic}</td>
                                    <td>{character.retired ? 'yes' : 'no'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <Form
                        method="post"
                        onBlur={(e) => {
                            const form = e.target as HTMLFormElement;
                            form.reset();
                        }}
                    >
                        <label>
                            Name:
                            <input type="text" name="name" required />
                        </label>
                        <button
                            name="action"
                            value="add-character"
                            className="mt-5 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                        >
                            Add Character
                        </button>
                    </Form>
                </div>
                <div>
                    <h2 className="text-3xl">Quests</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Title</th>
                                <th>Description</th>
                                <th>Difficulty</th>
                                <th>Reward</th>
                                <th>Completed</th>
                            </tr>
                        </thead>
                        <tbody>
                            {quests.map((quest) => (
                                <tr key={quest.id}>
                                    <td>{quest.id}</td>
                                    <td>{quest.title}</td>
                                    <td>{quest.description}</td>
                                    <td>{quest.difficulty}</td>
                                    <td>{quest.reward}</td>
                                    <td>{quest.completed ? 'yes' : 'no'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <Form
                        method="post"
                        onBlur={(e) => {
                            const form = e.target as HTMLFormElement;
                            form.reset();
                        }}
                    >
                        <label>
                            Title:
                            <input type="text" name="title" required />
                        </label>
                        <button
                            name="action"
                            value="add-quest"
                            className="mt-5 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                        >
                            Add Quest
                        </button>
                    </Form>
                </div>
            </div>
        </main>
    );
}
