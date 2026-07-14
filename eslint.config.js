import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.svelte-kit/**',
      '**/coverage/**',
      'pnpm-lock.yaml'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser
      }
    }
  },
  {
    files: ['apps/web-app/src/lib/camera/shared/**/*.{ts,js,svelte,svelte.ts,svelte.js}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '$lib/camera/media/**',
                '$lib/camera/room/**',
                '$lib/camera/effects/**',
                '$lib/camera/publish/**'
              ],
              message: 'shared must stay domain-agnostic and cannot import camera domains.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['apps/web-app/src/lib/camera/media/**/*.{ts,js,svelte,svelte.ts,svelte.js}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['$lib/camera/room/**', '$lib/camera/effects/**', '$lib/camera/publish/**'],
              message: 'media must not depend on room/effects/publish.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['apps/web-app/src/lib/camera/room/**/*.{ts,js,svelte,svelte.ts,svelte.js}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['$lib/camera/effects/**', '$lib/camera/publish/**', '$lib/camera/media/core/**'],
              message:
                'room must not depend on effects/publish and should not import media internals.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['apps/web-app/src/lib/camera/effects/**/*.{ts,js,svelte,svelte.ts,svelte.js}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['$lib/camera/publish/**', '$lib/camera/media/core/**', '$lib/camera/room/core/**'],
              message:
                'effects must not depend on publish or other domains internals (core).'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['apps/web-app/src/lib/camera/publish/**/*.{ts,js,svelte,svelte.ts,svelte.js}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '$lib/camera/media/core/**',
                '$lib/camera/room/core/**',
                '$lib/camera/room/api/**',
                '$lib/camera/effects/geometry/**',
                '$lib/camera/effects/renderers/**',
                '$lib/camera/effects/tracking/**'
              ],
              message:
                'publish is an integration layer; depend on domain controllers/public abstractions, not internals.'
            }
          ]
        }
      ]
    }
  },
  {
    // Node/CommonJS-style workspace files
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs'
    }
  },
  {
    rules: {
      // keep it soft, catch real bugs not style problems
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-unused-vars': 'off',
      // Svelte 5 idiom: bare property reads inside $effect() are intentional
      // dependency-tracking statements, not dead code -- the rule doesn't
      // understand runes semantics.
      '@typescript-eslint/no-unused-expressions': 'off'
    }
  }
);
