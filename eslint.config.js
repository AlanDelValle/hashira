import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: ['public/build', 'vendor', 'node_modules', 'storage', 'bootstrap/cache'],
    },
    js.configs.recommended,
    {
        // Type-aware linting applies to the application only; config files have no program.
        files: ['**/*.{ts,tsx}'],
        extends: [tseslint.configs.recommendedTypeChecked],
        languageOptions: {
            globals: globals.browser,
            parserOptions: {
                projectService: true,
                tsconfigRootDir: import.meta.dirname,
            },
        },
        plugins: {
            'react-hooks': reactHooks,
        },
        rules: {
            ...reactHooks.configs.recommended.rules,

            // The document, geometry and command layers are plain TypeScript on purpose.
            // An `any` there hides exactly the bugs those layers exist to prevent.
            '@typescript-eslint/no-explicit-any': 'error',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
            '@typescript-eslint/consistent-type-imports': [
                'error',
                { fixStyle: 'inline-type-imports' },
            ],
            'no-console': ['error', { allow: ['warn', 'error'] }],
            eqeqeq: ['error', 'always'],
            'prefer-const': 'error',
        },
    },
    {
        files: ['**/*.js'],
        languageOptions: { globals: globals.node },
    },
);
