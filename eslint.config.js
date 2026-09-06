import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    // I componenti generati da shadcn esportano anche le varianti cva
    // accanto al componente: la regola di Fast Refresh non si applica.
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Strato model: TypeScript puro. Solo zod.
    files: ['src/model/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['react', 'react-dom', 'react/*', 'zustand', 'zustand/*', 'immer',
            '@/editor/**', '@/ui/**', '@/io/**', '**/editor/**', '**/ui/**', '**/io/**'],
          message: 'src/model è TypeScript puro: niente React, store o strati superiori.',
        }],
      }],
    },
  },
  {
    // Strato editor: conosce model, zustand e immer. Mai React né ui.
    files: ['src/editor/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{
          group: ['react', 'react-dom', 'react/*', '@/ui/**', '@/io/**', '**/ui/**', '**/io/**'],
          message: 'src/editor non conosce React né src/ui.',
        }],
      }],
    },
  },
])
