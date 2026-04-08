# Astro Islands Architecture

> Ship zero JavaScript by default — hydrate only the interactive components that need it, exactly when they need it.

## When to Use

- You are building a page that mixes static content with interactive UI components
- You need to choose the right `client:*` directive for a framework component (React, Vue, Svelte, Solid, Preact)
- A page is shipping more JavaScript than necessary and you want to audit hydration
- You are deciding whether a component should be a static `.astro` component or a hydrated island
- You want to defer expensive component hydration until the user actually needs it

## Instructions

1. Default to `.astro` components for all non-interactive UI. They render to pure HTML with zero JS shipped to the browser.

2. Use framework components (React, Vue, Svelte, etc.) only when client-side interactivity is required (event handlers, stateful UI, browser APIs).

3. Apply a `client:*` directive to every framework component that must hydrate. Without a directive, the component renders as static HTML only.

4. Choose the directive that matches when the component becomes interactive:
   - `client:load` — hydrate immediately on page load. Use for above-the-fold critical UI (navigation menus, login forms).
   - `client:idle` — hydrate after the browser's `requestIdleCallback`. Use for non-critical interactive widgets.
   - `client:visible` — hydrate when the component scrolls into the viewport (Intersection Observer). Use for below-the-fold content, carousels, comment sections.
   - `client:media="(max-width: 768px)"` — hydrate only when a CSS media query matches. Use for mobile-only components.
   - `client:only="react"` — skip SSR entirely, render and hydrate on the client only. Use for components that depend on browser-only APIs (`window`, `localStorage`, WebGL).

5. Never use `client:load` as a default for all interactive components. Prefer `client:idle` or `client:visible` whenever the component is not immediately visible.

6. Pass data into islands via props. Islands are isolated — they do not share state automatically.

```astro
---
// src/pages/index.astro
import StaticHeader from '../components/StaticHeader.astro';
import Counter from '../components/Counter.jsx';
import HeavyChart from '../components/HeavyChart.jsx';
import MobileMenu from '../components/MobileMenu.jsx';
---

<!-- Zero JS: pure static HTML -->
<StaticHeader />

<!-- Critical interactive: hydrate immediately -->
<Counter client:load initialCount={0} />

<!-- Below the fold: hydrate when visible -->
<HeavyChart client:visible data={chartData} />

<!-- Mobile only: skip on desktop entirely -->
<MobileMenu client:media="(max-width: 768px)" />
```

7. Audit your islands by running the build and inspecting the `dist/` output. Each `client:*` directive produces a separate JS chunk. Large chunks indicate over-hydration.

8. Use `transition:persist` from the View Transitions API to keep an island alive across page navigations — avoiding a re-hydration cost.

## Details

Islands Architecture was coined by Katie Sylor-Miller and popularized by Jason Miller. The central idea: treat the page as a sea of static HTML with interactive "islands" embedded within it. Each island is an independently hydrated component — its JavaScript is fetched and executed only for that component, not for the whole page.

**Why this matters:** A traditional SPA ships a full JavaScript bundle and hydrates the entire page. Astro's island approach means a content-heavy page (blog post, marketing landing page, documentation) ships zero JavaScript unless you explicitly add `client:*` to a component. This dramatically improves Time to Interactive (TTI) and Largest Contentful Paint (LCP).

**How hydration works under the hood:**

Astro serializes the component's props into the HTML at build time. When the browser loads the page, Astro's tiny runtime reads the directive, waits for the right moment (load, idle, visible, media match), then dynamically imports the component's framework bundle and hydrates it with the serialized props. Each island is fully independent.

**Trade-offs:**

- Islands cannot directly share React state with each other. Cross-island state requires nanostores or a shared URL/storage mechanism.
- `client:only` components are invisible to SEO crawlers and do not SSR. Use with care for content that should be indexed.
- `client:visible` adds an Intersection Observer per island — negligible cost, but be aware on pages with hundreds of islands.
- Passing non-serializable props (class instances, functions, symbols) to islands will fail. Props must be plain JSON-serializable values.

**Island communication patterns:**

- Use nanostores (`@nanostores/react`, `@nanostores/vue`, etc.) for shared reactive state across islands.
- Use custom events (`window.dispatchEvent` / `window.addEventListener`) for lightweight cross-island messaging.
- Use URL search params or `localStorage` for state that must survive navigation.

**Partial hydration vs. progressive enhancement:**

Islands Architecture is a form of partial hydration — you hydrate parts of the page, not all of it. This differs from progressive enhancement, which starts with fully functional HTML and layers JS on top. In practice, combine both: your `.astro` components are always progressive-enhancement-friendly, and your islands add richer interactivity.

## Source

https://docs.astro.build/en/concepts/islands
