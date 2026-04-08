# Astro View Transitions

> Animate page navigations with native browser View Transitions API, persist interactive islands across pages, and hook into the transition lifecycle.

## When to Use

- You want smooth animated transitions between pages without building a SPA
- You need a persistent element (audio player, cart widget, sticky header) that survives page navigation without re-mounting
- You are implementing shared-element transitions where a thumbnail morphs into a hero image on the next page
- You need to run JavaScript before or after a page swap (re-initialize analytics, trigger animations)
- You are debugging a flash of unstyled content or a broken transition and need to understand the lifecycle events

## Instructions

1. Add the `<ViewTransitions />` component to your layout's `<head>`. This is the only thing needed to enable Astro's router and transition support:

```astro
---
// src/layouts/BaseLayout.astro
import { ViewTransitions } from 'astro:transitions';
---
<html>
  <head>
    <meta charset="utf-8" />
    <ViewTransitions />
  </head>
  <body>
    <slot />
  </body>
</html>
```

2. Use `transition:name` to create a shared-element transition between two pages. The value must be unique on the page and match on both the source and destination page:

```astro
<!-- Blog index: thumbnail -->
<img src={post.cover} transition:name={`cover-${post.slug}`} alt="" />

<!-- Blog post: hero image — same transition:name value -->
<img src={post.data.cover} transition:name={`cover-${post.slug}`} class="hero" alt="" />
```

3. Control the animation style with `transition:animate`. Built-in animations are `fade` (default), `slide`, `morph`, and `none`:

```astro
<!-- Slide in from the right -->
<main transition:animate="slide">
  <slot />
</main>

<!-- Suppress animation on a specific element -->
<nav transition:animate="none">...</nav>
```

4. Use `transition:persist` to keep an element alive across page navigations, preventing remount and preserving state:

```astro
<!-- Audio player that continues playing across pages -->
<audio-player transition:persist="audio-player" src={streamUrl} />

<!-- React island that keeps its internal state -->
<ShoppingCart client:load transition:persist />
```

5. Listen to Astro's transition lifecycle events on `document` to run code at specific moments:

```javascript
// src/scripts/analytics.js
document.addEventListener('astro:page-load', () => {
  // Fires after every page load, including the initial one
  // Re-initialize scripts that rely on DOM presence
  initAnalytics();
});

document.addEventListener('astro:before-swap', (e) => {
  // e.newDocument is the incoming Document object
  // Mutate it before the swap — add/remove classes, inject elements
});

document.addEventListener('astro:after-swap', () => {
  // DOM has been replaced — re-query elements
  highlightActiveNavLink();
});
```

6. Handle the `astro:page-load` event instead of `DOMContentLoaded` for any script that must run on every navigation. `DOMContentLoaded` only fires on hard page loads:

```javascript
// Wrong: only fires on initial load
document.addEventListener('DOMContentLoaded', init);

// Correct: fires on both initial load and every view transition
document.addEventListener('astro:page-load', init);
```

7. Opt individual links out of view transitions with `data-astro-reload`:

```astro
<!-- Forces a full page reload for this link -->
<a href="/admin" data-astro-reload>Admin Panel</a>
```

8. Use `transition:animate` with a custom animation object for full control:

```typescript
import { fade } from 'astro:transitions';
// Custom duration
const slowFade = fade({ duration: '0.8s' });
```

```astro
<main transition:animate={slowFade}>...</main>
```

## Details

Astro View Transitions is built on the browser-native View Transitions API (Chrome 111+, with a fallback for other browsers). When `<ViewTransitions />` is present, Astro intercepts link clicks, fetches the next page's HTML in the background, and performs a DOM swap — without a full page reload. This is what enables the cross-document transitions.

**How the swap works:**

1. User clicks a link
2. Astro fetches the destination page's HTML
3. `astro:before-preparation` fires (you can cancel here)
4. Astro prepares the new document in memory
5. `astro:before-swap` fires — `e.newDocument` is available for mutation
6. Browser performs the View Transition swap (screenshot old state → animate to new state)
7. `astro:after-swap` fires — DOM is now the new page
8. `astro:page-load` fires — transition animation is complete

**`transition:persist` with framework components:**

When a `client:load` island has `transition:persist`, Astro moves the existing DOM node to the new page instead of unmounting and remounting it. The island's JavaScript state (React state, Vue reactive data) is preserved. This is how you build a music player or a persistent chat widget.

**Fallback for unsupported browsers:**

Astro provides an automatic fallback for browsers that do not support the native View Transitions API. By default it uses `animate` (CSS animation fallback). Set `fallback="none"` to disable the fallback entirely, or `fallback="swap"` for an instant DOM swap with no animation.

```astro
<ViewTransitions fallback="none" />
```

**Performance considerations:**

View Transitions prefetch the next page on hover (configurable). This means navigation latency is typically near-zero. However, the transition itself is GPU-accelerated via the browser — avoid complex CSS transforms on transitioned elements that could cause paint storms.

**Scroll behavior:**

By default, Astro scrolls to the top on navigation (matching full-page-load behavior). Override this with `transition:animate` options or by listening to `astro:after-swap` and calling `window.scrollTo()` manually.

## Source

https://docs.astro.build/en/guides/view-transitions
