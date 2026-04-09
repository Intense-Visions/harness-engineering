# React Islands Pattern

> Hydrate only interactive UI islands, leaving static content as HTML

## When to Use

- Content-heavy pages where most HTML is static but a few widgets need interactivity
- Performance-critical pages where full React hydration is too expensive
- Using Astro, Fresh, or Next.js with `'use client'` directives
- You want Time to Interactive (TTI) improvements by deferring non-essential JS

## Instructions

1. Identify which page regions are interactive (search bar, shopping cart, comments) vs static (header, article body).
2. Mark interactive regions as client-side islands using your framework's mechanism:
   - **Astro:** `client:load`, `client:idle`, `client:visible` on components
   - **Next.js App Router:** `'use client'` at the top of the component file
3. Keep islands as small as possible — each island is an independent React root.
4. Static content between islands is plain HTML — no React overhead.
5. Use `client:visible` (Astro) or lazy hydration for below-fold islands.

```tsx
// Astro example: only the interactive widget is hydrated
---
import StaticHeader from './StaticHeader.astro'; // no JS
import InteractiveSearch from './InteractiveSearch';  // React island
---
<StaticHeader />
<InteractiveSearch client:load />
<article>...static content...</article>
```

## Details

The islands pattern was popularized by Jason Miller (Preact creator) and Ethan Marcotte. The core insight: most web pages are "mostly static" — only specific regions need event handlers and state. Hydrating the entire page as a React app is wasteful.

**Trade-offs:**

- Islands cannot share React state directly — use URL parameters, localStorage, or a micro-frontend event bus for cross-island communication
- More complex architecture than a simple SPA
- Best suited for content-driven sites (docs, marketing, e-commerce) not dashboards

**React Server Components (RSC) vs islands:**

- RSC is React's first-party answer to the same problem in Next.js / frameworks
- The conceptual model is the same (server = static, client = interactive)
- RSC allows data co-location without the multi-root complexity

## Source

https://patterns.dev/react/islands-architecture

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
