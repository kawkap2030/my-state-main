import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'src-tauri', 'check_db.js', '.kilo']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', {
        varsIgnorePattern: '^[A-Z_]',
        argsIgnorePattern: '^_',
        caughtErrors: 'none',
      }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      'react-refresh/only-export-components': ['error', {
        allowExportNames: ['default', 'useAuth', 'useSmartNotification',
          'ROLE_HIERARCHY', 'ROLE_LABELS', 'ROLE_COLORS', 'hasPermission',
          'canEdit', 'isAdmin', 'AuthProvider', 'SmartNotificationProvider',
          'routePreloaders', 'preloadRoute', 'preloadCoreRoutes', 'router'],
      }],
    },
  },
  {
    files: ['**/tests/**/*.{js,jsx}', '**/*.test.{js,jsx}', '**/*.spec.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.browser, ...globals.vitest },
    },
  },
  // Node.js CommonJS scripts (convert_images.js uses require)
  {
    files: ['convert_images.js'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'commonjs',
    },
  },
  // Node.js ESM scripts (vite.config.js + playwright.config.js use process.env;
  // scripts/**/*.mjs are .mjs files that the main {js,jsx} block doesn't match)
  {
    files: ['vite.config.js', 'playwright.config.js', 'scripts/**/*.mjs'],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: 'module',
    },
  },
])
