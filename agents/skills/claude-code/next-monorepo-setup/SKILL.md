# Next.js Monorepo Setup

> Configure Next.js inside a monorepo with shared packages and Turborepo task orchestration

## When to Use

- Building multiple Next.js apps that share UI components, utilities, or configuration
- Organizing a full-stack TypeScript project with a shared database schema or API types
- Setting up Turborepo for parallel builds and remote caching across workspace packages
- Sharing ESLint, TypeScript, and Tailwind configuration across apps without duplication
- Publishing internal packages consumed by multiple Next.js frontends

## Instructions

1. Use `pnpm workspaces` (or npm/yarn workspaces) to declare the monorepo structure — define packages in `pnpm-workspace.yaml`.
2. Add `transpilePackages: ['@repo/ui', '@repo/lib']` to `next.config.ts` for any internal packages that ship TypeScript source instead of compiled output.
3. Configure `tsconfig.json` path aliases in each app to resolve internal packages: `"@repo/ui": ["../../packages/ui/src"]`.
4. Use `turbo.json` to define task pipelines — `build` depends on `^build` (all transitive deps must build first).
5. Share TypeScript config by creating a `packages/typescript-config` package with base configs that each app extends.
6. Share ESLint config via a `packages/eslint-config` package — export named configs for Next.js, React library, and Node.js contexts.
7. Define environment variables in each app's `.env` — do not share `.env` files across apps (each app has its own secrets).
8. Use `turbo run dev --filter=@repo/web` to start only the web app and its local dependencies during development.

```
monorepo/
  apps/
    web/                    ← Next.js app
      next.config.ts
      package.json          ← "name": "@repo/web"
    admin/                  ← Second Next.js app
  packages/
    ui/                     ← Shared React components
      src/
        button.tsx
      package.json          ← "name": "@repo/ui", main: "./src/index.ts"
    typescript-config/      ← Shared tsconfig bases
    eslint-config/          ← Shared ESLint configs
  turbo.json
  pnpm-workspace.yaml
  package.json              ← workspace root
```

```typescript
// apps/web/next.config.ts
import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@repo/ui', '@repo/db'],
};

export default config;

// turbo.json — task pipeline
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": { "dependsOn": ["^build"] },
    "typecheck": { "dependsOn": ["^build"] }
  }
}
```

## Details

A Next.js monorepo has two main integration points: package resolution (TypeScript can find shared packages) and build orchestration (shared packages compile before the apps that consume them).

**`transpilePackages` vs compiled output:** Internal packages can either ship TypeScript source (simpler, no build step needed) or compiled JavaScript. With TypeScript source, add the package to `transpilePackages` so Next.js compiles it. Compiled output packages need a build step in the Turborepo pipeline (`build` must run before the consuming app's `build`).

**Turborepo remote caching:** Run `turbo login` and `turbo link` to connect to Vercel Remote Cache. CI builds share a cache — if `@repo/ui` did not change, its `build` is replayed from cache. This dramatically reduces CI times on large monorepos.

**Path aliases vs package resolution:** TypeScript path aliases (`@repo/ui` → `../../packages/ui/src`) work for type checking but not for runtime resolution. The package's `main`/`exports` field in `package.json` controls runtime resolution. Keep both in sync.

**`dev` task with `persistent: true`:** Turborepo treats persistent tasks (long-running dev servers) differently from build tasks. Mark `dev` as `persistent: true` so Turbo does not wait for it to exit before starting dependent tasks.

**Shared Tailwind config:** Create `packages/tailwind-config/index.ts` exporting a shared Tailwind preset. Each app imports it in `tailwind.config.ts` via `presets: [require('@repo/tailwind-config')]`. Include the shared package's source paths in `content` glob patterns so Tailwind scans them for class names.

## Source

https://turbo.build/repo/docs/guides/tools/nextjs
