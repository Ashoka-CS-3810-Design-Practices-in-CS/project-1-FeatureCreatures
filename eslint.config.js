import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// PRE:  groups is a non-empty list of import specifiers or globs; message is a non-empty string
// POST: returns an ESLint rules object that reports every import matching one of groups, with message
function restrict(groups, message) {
  return { 'no-restricted-imports': ['error', { patterns: [{ group: groups, message }] }] };
}

// Layer boundaries from TECH_SPEC §3.2. Later blocks override earlier ones for the same rule,
// so the narrower algorithms block comes after the general engine block.
export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'blob-report'] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['src/ui/**/*.{ts,tsx}', 'src/main.tsx'],
    ...reactHooks.configs.flat['recommended-latest'],
  },
  {
    files: ['src/shared/**/*.ts'],
    rules: restrict(
      ['@/ui/**', '@/engine/**', '@/data/**', 'react', 'dexie', 'zustand'],
      'shared must not depend on upper layers',
    ),
  },
  {
    files: ['src/engine/**/*.ts'],
    rules: restrict(
      [
        '@/ui/**',
        '@/data/dexieRepository',
        '@/data/memoryRepository',
        '@/data/samples/**',
        'react',
        'react-dom',
        'dexie',
        'zustand',
        '@fullcalendar/*',
      ],
      'engine must not depend on UI or storage adapters',
    ),
  },
  {
    files: ['src/engine/algorithms/**/*.ts'],
    rules: restrict(
      [
        '@/ui/**',
        '@/data/**',
        '@/engine/pipelines/**',
        '@/engine/facade',
        '@/engine/state',
        '@/engine/search',
        '@/shared/time',
        '@/shared/schemas',
        'date-fns',
        'date-fns/*',
        'react',
        'dexie',
        'zustand',
      ],
      'algorithms must be pure (TECH_SPEC §3.2)',
    ),
  },
  {
    files: ['src/data/**/*.ts'],
    rules: restrict(['@/engine/**', '@/ui/**', 'react'], 'data must not depend on engine/UI'),
  },
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: restrict(
      [
        '@/engine/algorithms/**',
        '@/engine/pipelines/**',
        '@/engine/state',
        '@/engine/search',
        '@/data/dexieRepository',
        '@/data/memoryRepository',
      ],
      'UI talks to the engine facade only',
    ),
  },
  {
    files: ['**/*.test.{ts,tsx}', 'tests/**', 'bench/**', 'e2e/**', 'src/main.tsx'],
    rules: { 'no-restricted-imports': 'off' },
  },
);
