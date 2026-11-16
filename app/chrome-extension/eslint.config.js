import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';
import { defineConfig } from 'eslint/config';
import prettierConfig from 'eslint-config-prettier';

export default defineConfig([
  // Global ignores - these apply to all configurations
  {
    ignores: [
      'dist/**',
      '.output/**',
      '.wxt/**',
      'node_modules/**',
      'logs/**',
      '*.log',
      '.cache/**',
      '.temp/**',
      '.vscode/**',
      '!.vscode/extensions.json',
      '.idea/**',
      '.DS_Store',
      'Thumbs.db',
      '*.zip',
      '*.tar.gz',
      'stats.html',
      'stats-*.json',
      'libs/**',
      'workers/**',
      'public/libs/**',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs,ts,vue}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        chrome: 'readonly',
      },
    },
  },
  ...tseslint.configs.recommended,
  // typescript-eslint 8.72 no longer guesses between the root and app tsconfig roots.
  { languageOptions: { parserOptions: { tsconfigRootDir: import.meta.dirname } } },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-empty': 'off',
      // Rules added to eslint:recommended in ESLint 10; kept off to preserve the pre-upgrade rule set.
      'no-useless-assignment': 'off',
      'preserve-caught-error': 'off',
    },
  },
  pluginVue.configs['flat/essential'],
  { files: ['**/*.vue'], languageOptions: { parserOptions: { parser: tseslint.parser } } },
  // Prettier configuration - must be placed last to override previous rules
  prettierConfig,
]);
