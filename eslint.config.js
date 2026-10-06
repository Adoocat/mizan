import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * Money safety (CLAUDE.md, PLAN §18): money, quantities, prices and rates are Decimal/Money
 * from @mizan/domain. These patterns are how floats sneak in, so they are banned in app and
 * package code. Arithmetic operators on Decimal/Money are already a type error, and
 * `restrict-plus-operands` blocks string concatenation with them.
 * Where a float is genuinely needed (pixel positions in a chart), disable with a comment saying why.
 */
const MONEY_SAFETY = [
  {
    selector: "CallExpression[callee.name='parseFloat']",
    message:
      'parseFloat produces floats. Use parseDecimalInput/parseMoneyInput from @mizan/domain.',
  },
  {
    selector: "CallExpression[callee.object.name='Number'][callee.property.name='parseFloat']",
    message:
      'Number.parseFloat produces floats. Use parseDecimalInput/parseMoneyInput from @mizan/domain.',
  },
  {
    selector: "CallExpression[callee.name='Number']",
    message:
      'Number() converts to a float. Use decimal() for amounts or Number.parseInt for integers.',
  },
  {
    selector: "UnaryExpression[operator='+']",
    message:
      'Unary + converts to a float. Use decimal() for amounts or Number.parseInt for integers.',
  },
  {
    selector: "CallExpression[callee.property.name='toNumber']",
    message: 'toNumber() turns a Decimal into a float. Keep values as Decimal/Money.',
  },
  {
    selector: "CallExpression[callee.object.name='Math'][callee.property.name='round']",
    message: 'Math.round is float rounding. Use Money.roundToMinor() or Decimal.toDecimalPlaces().',
  },
]

/** The domain is pure: the current time is injected through a Clock. */
const DOMAIN_PURITY = [
  {
    selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']",
    message: 'Domain code never reads the system clock. Take a Clock parameter.',
  },
  {
    selector: "NewExpression[callee.name='Date'][arguments.length=0]",
    message: 'Domain code never reads the system clock. Take a Clock parameter.',
  },
  {
    selector: "CallExpression[callee.object.name='Math'][callee.property.name='random']",
    message: 'Domain code must be deterministic.',
  },
]

const NO_DANGEROUS_HTML = {
  selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
  message: 'dangerouslySetInnerHTML is banned (XSS). Render text through React instead.',
}

export default defineConfig([
  globalIgnores([
    '**/node_modules/',
    '**/dist/',
    '**/coverage/',
    '**/playwright-report/',
    '**/test-results/',
    'design/',
    'apps/api/src/db/migrations/',
  ]),

  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.js', 'packages/config/*.js', 'packages/config/test/*.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/restrict-plus-operands': [
        'error',
        { allowAny: false, allowBoolean: false, allowNullish: false, allowRegExp: false },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Fastify plugins and hooks are async by contract even when they don't await.
      '@typescript-eslint/require-await': 'off',
      eqeqeq: ['error', 'always'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
    },
  },
  {
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },

  // Money safety everywhere in app and package source.
  {
    files: ['apps/*/src/**/*.{ts,tsx}', 'packages/*/src/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', ...MONEY_SAFETY] },
  },

  // The domain is also pure and deterministic.
  {
    files: ['packages/domain/src/**/*.ts'],
    ignores: ['packages/domain/src/**/*.test.ts'],
    rules: { 'no-restricted-syntax': ['error', ...MONEY_SAFETY, ...DOMAIN_PURITY] },
  },

  // Browser code
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: { ...globals.browser } },
    rules: { 'no-restricted-syntax': ['error', ...MONEY_SAFETY, NO_DANGEROUS_HTML] },
  },

  // Tests may use looser typing around mocks.
  {
    files: ['**/*.test.{ts,tsx}', '**/*.int.test.ts', 'e2e/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },

  prettier,
])
