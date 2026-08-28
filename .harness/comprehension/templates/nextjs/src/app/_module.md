---
schemaVersion: 1
module: "templates/nextjs/src/app"
sourceHash: "d1cfcd22a567e4a8018b6fe184f27076e292a2a774678584aab75487bf93a4fc"
compiledAt: "2026-08-28T01:22:12.839Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["layout.tsx", "page.tsx"]
---

## Summary

Minimal Next.js 13+ app-directory root layout and homepage. The `layout.tsx` establishes the HTML document shell, exports site metadata (title, description), and renders child routes via the `children` prop. The `page.tsx` provides the home route with a welcome heading. This is the entry point for the entire app—all pages and nested routes render within this root layout.

## Invariants

- Metadata export in layout.tsx must exist and define `title` and `description` for SEO and document head; if removed, the app loses its title.
- Default export in layout.tsx must be a component that accepts `{ children: React.ReactNode }` and renders `<html>` > `<body>` > `{children}`; Next.js requires this exact nesting for the app to boot.
- Default export in page.tsx must exist to serve the root route (`/`); if removed, requests to `/` have no renderer.
- App directory routing relies on Next.js file-based routing; moving or renaming these files breaks the route tree.

## Interface Contract

```ts
export default
export metadata
```

## Dependency Slice

```

```
