# Vue Async Components

> Load Vue components lazily to reduce initial bundle size using defineAsyncComponent

## When to Use

- A component is heavy (charts, editors, maps) and not needed on initial render
- Implementing route-based code splitting in a Vue Router application
- Conditionally loading components behind feature flags or user interactions

## Instructions

1. Use `defineAsyncComponent(() => import('./HeavyComponent.vue'))` to lazy-load.
2. Provide `loadingComponent` and `errorComponent` options for UX during loading.
3. Set a `delay` (ms) before showing the loading component to avoid flicker.
4. Wrap async components in `<Suspense>` for coordinated loading states.

```typescript
import { defineAsyncComponent } from 'vue';

const AsyncChart = defineAsyncComponent({
  loader: () => import('./Chart.vue'),
  loadingComponent: LoadingSpinner,
  errorComponent: ErrorDisplay,
  delay: 200,
  timeout: 10000,
});
```

5. For Vue Router, use `() => import('./views/Page.vue')` directly in route definitions.

## Details

Async components in Vue 3 use `defineAsyncComponent` to wrap a dynamic `import()`. The bundler splits the component into a separate chunk that is loaded only when the component is first rendered. This reduces the initial JavaScript payload.

**Trade-offs:**

- Loading delay — users see a spinner or blank space while the component loads
- Error handling is required — network failures must be caught and displayed gracefully
- Too many async components can cause a "waterfall" of sequential network requests
- SSR requires special handling — the server must await all async components before sending HTML

**When NOT to use:**

- For small, frequently used components — the overhead of a separate chunk is not worth it
- For above-the-fold content that must render immediately
- When the component is always needed — static import is simpler

## Source

https://patterns.dev/vue/async-components
