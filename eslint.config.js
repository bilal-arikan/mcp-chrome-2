import globals from 'globals';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  // Global ignores first - these apply to all configurations
  {
    ignores: [
      'node_modules/',
      'dist/',
      '.output/',
      '.wxt/',
      'logs/',
      '*.log',
      '.cache/',
      '.temp/',
      '.idea/',
      '.DS_Store',
      'Thumbs.db',
      '*.zip',
      '*.tar.gz',
      'stats.html',
      'stats-*.json',
      'pnpm-lock.yaml',
      '**/workers/**',
      'app/**/workers/**',
      'packages/**/workers/**',
      'test-inject-script.js',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  // typescript-eslint 8.72 no longer guesses between the root and app tsconfig roots.
  { languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } } },
  // Global rule adjustments
  {
    // Allow intentionally empty catch blocks (common in extension code),
    // while keeping other empty blocks reported.
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Rules added to eslint:recommended in ESLint 10; kept off to preserve the pre-upgrade rule set.
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
    },
  },
  {
    files: ['app/**/*.{js,jsx,ts,tsx}', 'packages/**/*.{js,jsx,ts,tsx}'],
    ignores: ['**/workers/**'], // Additional ignores for this specific config
    languageOptions: {
      ecmaVersion: 2021,
      sourceType: 'module',
      parser: tseslint.parser,
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },

    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  eslintConfigPrettier,
);
