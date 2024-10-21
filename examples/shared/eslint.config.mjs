import defaultConfig from 'eslint-config-custom';

export default [
    ...defaultConfig,
    {
        // for the sake of the example, we're going to disable some
        rules: {
            '@typescript-eslint/no-empty-object-type': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
        },
    },
];
