# Nuxt Auto-Imports

> Use composables, components, and utilities in Nuxt without writing any import statements

## When to Use

- You are working in a Nuxt 3 project and writing composables, components, or utility functions
- You see import errors for things like `ref`, `computed`, `useState`, `useFetch`, or custom composables
- You want to understand why a Nuxt project has no import statements at the top of `.vue` files
- You are registering custom auto-import directories or disabling auto-imports for specific cases

## Instructions

1. Place composables in `composables/` — any function exported from a file in this directory is auto-imported by name. Use named exports for tree-shaking.
2. Place components in `components/` — components are auto-imported using their file path as the component name (e.g., `components/base/Button.vue` becomes `<BaseButton />`).
3. Place utility functions in `utils/` — exported functions are auto-imported globally.
4. Vue Composition API (`ref`, `computed`, `watch`, `reactive`, etc.) and Nuxt composables (`useFetch`, `useRoute`, `useState`, etc.) are always auto-imported — never import them manually.
5. To add custom auto-import directories, use `imports.dirs` in `nuxt.config.ts`:

```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  imports: {
    dirs: ['stores', 'services'],
  },
});
```

6. To disable auto-imports globally (rare), set `imports.autoImport: false`. To disable per-file, add `// @ts-nocheck` or restructure to use explicit imports.
7. Use `#imports` for explicit imports in edge cases (e.g., Vitest tests that run outside Nuxt context):

```typescript
import { ref, computed } from '#imports';
```

8. Auto-imported types are available in `.nuxt/types/imports.d.ts` — regenerate with `nuxt prepare` when stale.
9. Avoid naming collisions: if two composables in different files export the same name, Nuxt resolves by the last one found. Use unique, descriptive names.

## Details

Nuxt's auto-import system is powered by `unplugin-auto-import` and `unplugin-vue-components`. At build time, Nuxt scans the configured directories and generates TypeScript declaration files in `.nuxt/` that declare each composable and component as a global. The result: zero import statements in application code while retaining full type safety.

**Component naming convention:**

The component name is derived from its path relative to `components/`. Nested directories are flattened using PascalCase concatenation:

```
components/
  ui/
    Card.vue          → <UiCard />
    button/
      Primary.vue     → <UiButtonPrimary />
  base/
    Input.vue         → <BaseInput />
```

**Lazy-loading components:**

Prefix with `Lazy` to defer loading until the component is mounted:

```html
<LazyHeavyChart v-if="showChart" />
```

**Explicit disabling for testing:**

Vitest runs outside Nuxt's build pipeline, so auto-imports are unavailable by default. Use `@nuxt/test-utils` or import from `#imports`:

```typescript
// In test files
import { mountSuspended } from '@nuxt/test-utils/runtime';
```

**When NOT to use auto-imports:**

- Library packages intended to be consumed outside Nuxt (use explicit imports for portability)
- Files in `server/` — server routes use a separate auto-import layer with different rules

## Source

https://nuxt.com/docs/guide/concepts/auto-imports
