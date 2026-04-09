# Astro Component Pattern

> The `.astro` file format — server-only frontmatter, HTML-like templates, and scoped CSS — is the foundation of every Astro project.

## When to Use

- You are creating a new UI component that does not require client-side interactivity
- You need to fetch data at request/build time and render it as static HTML
- You want CSS that is automatically scoped to the component without a CSS module setup
- You are building layouts, pages, or reusable UI fragments in an Astro project
- You need to understand the anatomy of `.astro` files before working with islands, routing, or content collections

## Instructions

1. Structure every `.astro` file with three sections in order: frontmatter script, template, and optional `<style>`:

```astro
---
// 1. Frontmatter (runs server-side only — never sent to the browser)
import OtherComponent from './OtherComponent.astro';
import type { Props } from './types';

interface Props {
  title: string;
  description?: string;
  variant?: 'primary' | 'secondary';
}

const { title, description = 'No description', variant = 'primary' } = Astro.props;
const formattedDate = new Date().toLocaleDateString('en-US');
---

<!-- 2. Template (JSX-like but compiles to plain HTML) -->
<article class={`card card--${variant}`}>
  <h2>{title}</h2>
  <p>{description}</p>
  <OtherComponent date={formattedDate} />
</article>

<!-- 3. Scoped styles (automatically namespaced — no class collisions) -->
<style>
  .card {
    border: 1px solid var(--color-border);
    padding: 1rem;
  }
  .card--primary { background: var(--color-surface); }
  .card--secondary { background: var(--color-muted); }
</style>
```

2. Declare `Props` as a TypeScript interface inside the frontmatter. Astro reads this interface to provide type-safe props at the call site.

3. Destructure props from `Astro.props`. The `Astro` global is available in every `.astro` file — it also provides `Astro.url`, `Astro.site`, `Astro.request`, `Astro.cookies`, `Astro.redirect()`, and `Astro.locals`.

4. Use `<slot />` to render child content passed between component tags. Named slots handle multiple content areas:

```astro
<!-- Layout.astro -->
<header><slot name="header" /></header>
<main><slot /></main>  <!-- default slot -->
<footer><slot name="footer" /></footer>
```

```astro
<!-- Usage -->
<Layout>
  <h1 slot="header">Page Title</h1>
  <p>Main content goes in the default slot.</p>
  <p slot="footer">Footer text</p>
</Layout>
```

5. Apply `is:global` to override scoped styles when you must style child component internals or third-party HTML:

```astro
<style is:global>
  /* Applies globally — use sparingly */
  .prose h2 { margin-top: 2rem; }
</style>
```

6. Use `define:vars` to pass frontmatter variables into scoped CSS as custom properties:

```astro
---
const accentColor = '#ff6b35';
---
<div class="hero">Hero section</div>
<style define:vars={{ accentColor }}>
  .hero { background: var(--accentColor); }
</style>
```

7. Use template expressions for conditional rendering and iteration:

```astro
<!-- Conditional -->
{isLoggedIn && <UserMenu />}
{isLoggedIn ? <UserMenu /> : <LoginButton />}

<!-- Iteration -->
{items.map((item) => (
  <li key={item.id}>{item.name}</li>
))}

<!-- Fragments (no wrapper element) -->
<>
  <dt>{term}</dt>
  <dd>{definition}</dd>
</>
```

8. Never write `import` statements inside the template section. All imports and logic belong in the frontmatter fence.

## Details

The `.astro` format is superficially similar to JSX but has a fundamental difference: the frontmatter runs exclusively on the server (or at build time). It never reaches the browser. This means you can safely use Node.js APIs, read files, query databases, and import server-only packages in the frontmatter fence.

**Scoped styles explained:**

Astro transforms scoped `<style>` blocks by adding a unique data attribute (e.g., `data-astro-cid-xyz`) to every element the component renders and scoping the CSS to that attribute. This prevents style leakage without requiring CSS Modules or a naming convention. The compiled CSS is extracted and bundled separately — it does not live inline in the HTML.

**Template differences from JSX:**

- Use `class` not `className` (Astro is HTML, not React)
- `set:html` instead of `dangerouslySetInnerHTML`: `<p set:html={rawHtml} />`
- `is:raw` on code blocks to prevent Astro from processing curly braces inside
- Expressions are wrapped in `{}` and must be single expressions — no multi-statement blocks in the template

**Performance characteristics:**

`.astro` components have zero runtime overhead. They compile to static HTML strings at build time (SSG) or at request time (SSR). No virtual DOM, no reconciliation, no hydration cost. A page made entirely of `.astro` components ships exactly 0 bytes of JavaScript.

**When to reach for a framework component instead:**

Use `.astro` for everything that does not need `onClick`, `useState`, or any browser-only API. When interactivity is required, create a React/Vue/Svelte component and import it into the `.astro` file with a `client:*` directive. The `.astro` wrapper remains server-rendered; only the framework component hydrates.

**Layouts:**

Layouts are `.astro` components that use `<slot />` to wrap page content. They live in `src/layouts/` by convention. A layout component wraps page-level structure (`<html>`, `<head>`, `<body>`) and injects page-specific content via slots. Astro does not enforce a special layout mechanism — layouts are just components with slots.

## Source

https://docs.astro.build/en/basics/astro-components

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
