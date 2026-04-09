# Nuxt Plugins Pattern

> Extend the Nuxt application instance, register global services, and provide values to composables using defineNuxtPlugin

## When to Use

- You need to register a third-party Vue plugin (e.g., a component library, analytics SDK, i18n)
- You need to provide a global helper or service accessible via `useNuxtApp().$myHelper`
- You want to run initialization code once when the app starts (client or server)
- You need to initialize something only on the client (browser APIs) or only on the server

## Instructions

1. Create files in `plugins/` — they are automatically registered. Files are named without registration in `nuxt.config.ts`:

```typescript
// plugins/my-plugin.ts
export default defineNuxtPlugin((nuxtApp) => {
  // runs on both server and client
});
```

2. Register Vue plugins by calling `nuxtApp.vueApp.use()`:

```typescript
// plugins/vue-query.ts
import { VueQueryPlugin, QueryClient } from '@tanstack/vue-query';

export default defineNuxtPlugin((nuxtApp) => {
  const queryClient = new QueryClient();
  nuxtApp.vueApp.use(VueQueryPlugin, { queryClient });
});
```

3. Provide values accessible throughout the app via `useNuxtApp().$<name>`:

```typescript
// plugins/analytics.ts
export default defineNuxtPlugin(() => {
  const analytics = createAnalyticsClient();
  return {
    provide: {
      analytics,
    },
  };
});

// In any composable or component:
const { $analytics } = useNuxtApp();
$analytics.track('page_view');
```

4. Augment TypeScript types for provided values:

```typescript
// types/nuxt.d.ts
declare module '#app' {
  interface NuxtApp {
    $analytics: AnalyticsClient;
  }
}
declare module 'vue' {
  interface ComponentCustomProperties {
    $analytics: AnalyticsClient;
  }
}
export {};
```

5. Restrict execution to client-only by naming the file `.client.ts`:

```typescript
// plugins/crisp-chat.client.ts
export default defineNuxtPlugin(() => {
  // runs only in the browser
  window.$crisp = [];
  window.CRISP_WEBSITE_ID = 'your-id';
});
```

6. Restrict execution to server-only by naming the file `.server.ts`:

```typescript
// plugins/db-connection.server.ts
export default defineNuxtPlugin(async () => {
  await connectDatabase();
});
```

7. Control plugin execution order using numeric prefixes or the `order` property:

```typescript
// plugins/01.init.ts   — runs first
// plugins/02.auth.ts   — runs second

// Or use the order property (lower = earlier):
export default defineNuxtPlugin({
  name: 'auth',
  enforce: 'pre', // or 'post'
  setup(nuxtApp) {
    /* ... */
  },
});
```

8. Access other plugins or Nuxt context within a plugin via the `nuxtApp` argument:

```typescript
export default defineNuxtPlugin((nuxtApp) => {
  nuxtApp.hook('app:mounted', () => {
    console.log('App is mounted');
  });
});
```

## Details

**Plugin vs. composable vs. module:**

- **Plugin** — runs once at app startup; registers global functionality or third-party integrations
- **Composable** — called per-component, per-request; encapsulates reactive logic
- **Module** — build-time extension; modifies Nuxt/Nitro configuration, adds files, extends auto-imports

Use a plugin when you need one-time initialization. Use a composable when you need reactive per-call state.

**Async plugins:**

Plugins can be async. Nuxt awaits them before rendering the app (blocking). Use sparingly for critical initialization; defer non-critical work to `nuxtApp.hook('app:mounted', ...)`:

```typescript
export default defineNuxtPlugin(async (nuxtApp) => {
  await criticalInit(); // blocks SSR render
  nuxtApp.hook('app:mounted', () => {
    nonCriticalInit(); // deferred to client mount
  });
});
```

**Accessing the request event in server plugins:**

```typescript
export default defineNuxtPlugin((nuxtApp) => {
  const event = useRequestEvent(); // only valid server-side
  const userAgent = getHeader(event, 'user-agent');
});
```

**Plugin execution order with `enforce`:**

- `enforce: 'pre'` — runs before all default plugins
- `enforce: 'post'` — runs after all default plugins
- Numeric filename prefix (01, 02...) — controls order within the same enforce group

**When NOT to use:**

- Per-request initialization — use server middleware instead
- Business logic shared between components — use composables instead
- Build-time configuration — use Nuxt modules instead

## Source

https://nuxt.com/docs/guide/directory-structure/plugins

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
