# Astro Integration Pattern

> Build or consume Astro integrations to extend the build pipeline — add renderers, inject routes, modify Vite config, and hook into build lifecycle events.

## When to Use

- You are adding an official Astro integration (`@astrojs/react`, `@astrojs/tailwind`, `@astrojs/sitemap`) to a project
- You are writing a custom integration to encapsulate shared configuration across multiple Astro projects
- You need to inject a virtual route, a client-side script, or an additional Vite plugin
- You are authoring a third-party integration for the Astro ecosystem
- You want to understand what an integration's hooks are doing to debug build issues

## Instructions

1. Add official integrations in `astro.config.mjs` using the `integrations` array. Call each integration as a function:

```javascript
// astro.config.mjs
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwind from '@astrojs/tailwind';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://example.com',
  integrations: [react(), tailwind({ applyBaseStyles: false }), sitemap()],
});
```

2. Create a custom integration as a plain function that returns an object with a `name` and `hooks`:

```typescript
// my-integration.ts
import type { AstroIntegration } from 'astro';

export function myIntegration(options: { debug?: boolean } = {}): AstroIntegration {
  return {
    name: 'my-integration',
    hooks: {
      'astro:config:setup': ({ updateConfig, injectRoute, injectScript, addWatchFile, logger }) => {
        // Modify Vite config
        updateConfig({
          vite: {
            plugins: [myVitePlugin()],
            define: { __DEBUG__: options.debug ?? false },
          },
        });

        // Inject a virtual route
        injectRoute({
          pattern: '/my-integration-page',
          entrypoint: './src/my-integration/page.astro',
        });

        // Inject a script on every page
        injectScript('page', `console.log('Integration active');`);

        logger.info('My integration configured');
      },

      'astro:build:done': ({ dir, routes, logger }) => {
        logger.info(`Build complete. ${routes.length} routes generated.`);
      },
    },
  };
}
```

3. Use the correct hook for each type of work:

| Hook                 | When it runs                                | Common uses                                                  |
| -------------------- | ------------------------------------------- | ------------------------------------------------------------ |
| `astro:config:setup` | Before build starts                         | `updateConfig`, `injectRoute`, `injectScript`, `addRenderer` |
| `astro:config:done`  | After all integrations have modified config | Read the final resolved config                               |
| `astro:server:setup` | Dev server created                          | Add Vite dev server middleware                               |
| `astro:server:start` | Dev server listening                        | Log the dev URL                                              |
| `astro:build:start`  | Build starts                                | Initialize build-time resources                              |
| `astro:build:done`   | All pages/assets generated                  | Post-process output files, generate sitemaps                 |

4. Add a custom renderer (for a new UI framework) with `addRenderer()` inside `astro:config:setup`:

```typescript
'astro:config:setup': ({ addRenderer }) => {
  addRenderer({
    name: 'my-framework',
    serverEntrypoint: 'my-framework/server.js',
    clientEntrypoint: 'my-framework/client.js',
    jsxImportSource: 'my-framework',
    jsxTransformOptions: async () => ({
      plugins: [['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }]],
    }),
  });
}
```

5. Use `addWatchFile()` to trigger HMR when config files outside the project root change:

```typescript
'astro:config:setup': ({ addWatchFile, config }) => {
  addWatchFile(new URL('./my-config.json', config.root));
}
```

6. Read the user's final resolved Astro config in `astro:config:done` — this is after all integrations have run and the config is finalized:

```typescript
'astro:config:done': ({ config }) => {
  if (config.output === 'static') {
    // perform SSG-specific setup
  }
}
```

7. Export your integration alongside `defineConfig` in `astro.config.mjs` for colocation, or publish it as a separate npm package following the `astro-*` naming convention.

## Details

Astro integrations are the official extensibility mechanism. They are synchronous or async functions that hook into well-defined lifecycle points in the Astro build pipeline. Unlike Vite plugins (which are lower-level), Astro integrations have access to Astro-specific primitives like `injectRoute`, `addRenderer`, and the Astro config object.

**Integration execution order:**

Integrations are executed in the order they appear in the `integrations` array. Hook calls within each lifecycle event are also ordered. This matters when integrations modify shared config (e.g., Vite plugins) — later integrations see the changes made by earlier ones.

**`updateConfig` merging:**

`updateConfig()` does a deep merge with the existing config. Call it multiple times if needed — each call merges on top of the previous state. Be careful with arrays (like `vite.plugins`) — they are concatenated, not replaced.

**`injectRoute` and virtual modules:**

`injectRoute` adds a route to the Astro router backed by an actual file. For truly virtual content (generated at build time), pair it with a Vite virtual module plugin to serve the file from memory.

**Integration API stability:**

The `astro:config:setup` and `astro:build:done` hooks are stable. Hooks prefixed with `astro:server:*` are available only in development. The full hooks API is documented in the Astro Integrations Reference.

**Official integration patterns to study:**

- `@astrojs/sitemap` — minimal integration that generates files in `astro:build:done`
- `@astrojs/tailwind` — adds a Vite plugin via `updateConfig`
- `@astrojs/react` — uses `addRenderer` plus `updateConfig` for JSX transform

**Publishing guidelines:**

Name your package `astro-<feature>`. Add `astro` and `astro-component` to `keywords` in `package.json`. Export the integration as the default export. Add `"astro"` to `peerDependencies`.

## Source

https://docs.astro.build/en/reference/integrations-reference

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
