import prettier from 'eslint-config-prettier';
import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import globals from 'globals';

export default defineConfig(
  {
    ignores: ['**/node_modules/**', '**/vendor/**', '**/*.min.js', '**/*.min.css'],
  },
  js.configs.recommended,
  prettier,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
);
