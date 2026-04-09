# Nuxt Modules Pattern

> Extend Nuxt at build time with defineNuxtModule — add components, imports, plugins, and server routes programmatically

## When to Use

- You are building a reusable Nuxt integration (a library, a UI kit, a third-party service wrapper)
- You need to programmatically register components or composables based on configuration
- You want to modify the Nitro or Vite configuration from an installable package
- You are extracting shared Nuxt configuration from a monorepo into a local module

## Instructions

1. Create a module using `defineNuxtModule` from `@nuxt/kit`:

```typescript
// modules/my-feature/index.ts
import { defineNuxtModule, addComponent, addImports, createResolver } from '@nuxt/kit';

export default defineNuxtModule({
  meta: {
    name: 'my-feature',
    configKey: 'myFeature',
  },
  defaults: {
    enabled: true,
    prefix: 'My',
  },
  setup(options, nuxt) {
    if (!options.enabled) return;

    const { resolve } = createResolver(import.meta.url);

    // Register a component
    addComponent({
      name: `${options.prefix}Button`,
      filePath: resolve('./runtime/components/Button.vue'),
    });

    // Register a composable
    addImports({
      name: 'useMyFeature',
      as: 'useMyFeature',
      from: resolve('./runtime/composables/useMyFeature'),
    });
  },
});
```

2. Register the module in `nuxt.config.ts`:

```typescript
export default defineNuxtConfig({
  modules: ['./modules/my-feature'],
  myFeature: {
    prefix: 'Acme',
  },
});
```

3. Add a Nuxt plugin from within a module using `addPlugin`:

```typescript
import { addPlugin, createResolver } from '@nuxt/kit'

setup(options, nuxt) {
  const { resolve } = createResolver(import.meta.url)
  addPlugin(resolve('./runtime/plugin'))
}
```

4. Extend Nitro configuration from a module (e.g., add server routes, set CORS):

```typescript
setup(options, nuxt) {
  nuxt.hook('nitro:config', (nitroConfig) => {
    nitroConfig.handlers = nitroConfig.handlers || []
    nitroConfig.handlers.push({
      route: '/api/my-feature',
      handler: resolve('./runtime/server/api/my-feature')
    })
  })
}
```

5. Extend Vite configuration from a module:

```typescript
setup(options, nuxt) {
  nuxt.hook('vite:extendConfig', (viteConfig) => {
    viteConfig.plugins = viteConfig.plugins || []
    viteConfig.plugins.push(myVitePlugin())
  })
}
```

6. Add type declarations from a module:

```typescript
import { addTypeTemplate } from '@nuxt/kit'

setup(options, nuxt) {
  addTypeTemplate({
    filename: 'types/my-feature.d.ts',
    getContents: () => `
      declare module '#app' {
        interface NuxtApp {
          $myFeature: MyFeatureClient
        }
      }
      export {}
    `
  })
}
```

7. Use `nuxt.options.runtimeConfig` to expose module options to runtime:

```typescript
setup(options, nuxt) {
  nuxt.options.runtimeConfig.public.myFeature = {
    apiUrl: options.apiUrl
  }
}
```

## Details

**Module vs. plugin:**

Modules run at **build time** inside the Nuxt CLI process. Plugins run at **runtime** inside the Vite/Nitro bundle. Use modules when you need to modify the build, add files, or configure other build tools. Use plugins for runtime behavior.

**`@nuxt/kit` utilities reference:**

| Utility            | Purpose                                           |
| ------------------ | ------------------------------------------------- |
| `addComponent`     | Register a Vue component with auto-import         |
| `addImports`       | Register a composable or utility with auto-import |
| `addPlugin`        | Add a runtime Nuxt plugin                         |
| `addServerHandler` | Register a Nitro route handler                    |
| `addTemplate`      | Generate a virtual file in `.nuxt/`               |
| `addTypeTemplate`  | Generate a `.d.ts` declaration file               |
| `createResolver`   | Resolve file paths relative to the module         |
| `installModule`    | Install another Nuxt module from within a module  |

**Module hooks:**

Nuxt exposes lifecycle hooks that modules can tap into:

- `nuxt:ready` — all modules have loaded
- `nitro:config` — before Nitro is built
- `vite:extendConfig` — before Vite is built
- `components:dirs` — extend component scan directories
- `imports:dirs` — extend auto-import scan directories
- `pages:extend` — add or modify pages programmatically

**Publishing as a package:**

Follow the `nuxt-module-builder` convention for publishable modules. The `@nuxt/module-builder` CLI scaffolds the correct build config and exports.

**Local modules in monorepos:**

For workspace-internal modules, use a relative path in `modules`:

```typescript
modules: ['../../packages/ui/nuxt.ts'];
```

**When NOT to use:**

- Runtime-only concerns — use a plugin
- Per-component logic — use a composable
- Simple configuration — just extend `nuxt.config.ts` directly

## Source

https://nuxt.com/docs/guide/going-further/modules

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
