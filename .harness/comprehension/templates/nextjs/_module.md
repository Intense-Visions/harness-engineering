---
schemaVersion: 1
module: "templates/nextjs"
sourceHash: "b7bfe29d503eb0a5a9c3c43c8fb562cd00ebf3922dc14191165a2e04c5132a46"
compiledAt: "2026-08-28T01:22:12.821Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["next.config.mjs"]
---

## Summary

**`templates/nextjs`** is a Next.js framework overlay that scaffolds a minimal, standards-compliant Next.js 13+ project. It provides boilerplate for TypeScript-based applications using the App Router pattern, with Harness Engineering-aligned tooling (ESLint, Prettier, Vitest). The template is lightweight—an empty config, a generic root layout, and a welcome page—designed to be merged into target projects via an overlay strategy where the template's files win conflicts.

## Invariants

- Detection contract: The harness framework detection logic must recognize projects via next.config.mjs, next.config.js, or 'next' in package.json to apply this template.
- Merge semantics: mergeStrategy declares files: overlay-wins, meaning template files override conflicting targets; this must be honored during template application.
- App Router structure: Root layout (src/app/layout.tsx) must export metadata and render {children} to function as the app boundary; page components must use the directory-based routing convention (page.tsx files).
- Empty config extensibility: next.config.mjs is intentionally empty to avoid colliding with project-specific config; overrides must not hardcode settings here.
- Metadata export: Layout metadata (title, description) is expected by Next.js; omitting it may trigger runtime warnings in dev mode.

## Interface Contract

```ts
export default
```

## Dependency Slice

```

```
