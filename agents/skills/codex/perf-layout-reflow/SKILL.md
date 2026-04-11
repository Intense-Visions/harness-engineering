# Layout and Reflow

> Understand what triggers layout computation, how forced synchronous layouts and layout thrashing destroy frame budgets, and how to use containment and batching strategies to keep layout under 4ms per frame.

## When to Use

- Chrome DevTools Performance panel shows purple "Layout" blocks exceeding 4ms per frame
- DevTools warns "Forced reflow while executing JavaScript" in the console
- Scrolling or animation causes visible jank and the flame chart shows layout in the hot path
- Code reads `offsetWidth`, `offsetHeight`, or `getBoundingClientRect()` after writing style properties
- A drag-and-drop implementation stutters because it reads and writes layout properties in a loop
- You are animating CSS properties that trigger layout (`width`, `height`, `top`, `left`, `margin`, `padding`)
- A page with many elements needs layout isolation using CSS Containment
- `ResizeObserver` callbacks are triggering cascading layout recalculations
- DOM mutations during scroll events cause layout recalculation for the entire document
- You need to understand the difference between layout-triggering and compositor-only CSS properties

## Instructions

1. **Identify layout-triggering properties.** These CSS properties trigger layout when changed: `width`, `height`, `top`, `right`, `bottom`, `left`, `margin`, `padding`, `border-width`, `display`, `position`, `float`, `font-size`, `line-height`, `text-align`, `overflow`, `white-space`, and `flex` properties. Use `transform` and `opacity` instead when animating, as they only trigger compositing.

2. **Detect forced synchronous layout.** A forced synchronous layout occurs when JavaScript writes to a style property and then reads a layout property before the browser has a chance to batch the layout:

   ```javascript
   // FORCED SYNCHRONOUS LAYOUT — the read forces immediate layout
   element.style.width = '100px'; // write (schedules layout)
   const height = element.offsetHeight; // read (forces layout NOW)

   // CORRECT — batch writes, read separately
   const height = element.offsetHeight; // read first (uses cached layout)
   element.style.width = '100px'; // write (layout deferred to next frame)
   ```

3. **Eliminate layout thrashing.** Layout thrashing is a read-write-read-write loop that forces layout on every iteration:

   ```javascript
   // LAYOUT THRASHING — forces layout N times in a loop
   cards.forEach((card) => {
     const width = card.offsetWidth; // read: forces layout
     card.style.height = width + 'px'; // write: invalidates layout
   });

   // FIXED — batch all reads, then batch all writes
   const widths = cards.map((card) => card.offsetWidth); // one layout
   cards.forEach((card, i) => {
     card.style.height = widths[i] + 'px'; // no layout triggered
   });
   ```

4. **Use `requestAnimationFrame` for DOM writes.** Defer layout-triggering writes to the next frame to avoid interrupting the current frame's pipeline:

   ```javascript
   // Schedule DOM writes for the next frame
   function updateLayout(element, newWidth) {
     requestAnimationFrame(() => {
       element.style.width = newWidth + 'px';
     });
   }
   ```

5. **Apply CSS Containment for layout isolation.** `contain: layout` tells the browser that layout changes inside the container do not affect elements outside it. This limits the scope of layout recalculation:

   ```css
   .card {
     contain: layout; /* Layout changes inside .card do not trigger
                          layout recalculation for siblings or ancestors */
   }
   ```

6. **Use `ResizeObserver` instead of reading layout properties.** `ResizeObserver` reports element dimensions asynchronously without forcing synchronous layout:

   ```javascript
   // BAD — polls dimensions, may force synchronous layout
   setInterval(() => {
     const width = element.offsetWidth;
     if (width !== lastWidth) handleResize(width);
   }, 100);

   // GOOD — notified asynchronously when dimensions change
   const observer = new ResizeObserver((entries) => {
     for (const entry of entries) {
       handleResize(entry.contentRect.width);
     }
   });
   observer.observe(element);
   ```

## Details

### Layout Properties That Force Synchronous Layout

Reading any of these properties after a style change forces the browser to synchronously compute layout:

**Element geometry:** `offsetTop`, `offsetLeft`, `offsetWidth`, `offsetHeight`, `scrollTop`, `scrollLeft`, `scrollWidth`, `scrollHeight`, `clientTop`, `clientLeft`, `clientWidth`, `clientHeight`

**Computed layout:** `getComputedStyle()` (when reading layout-dependent values), `getBoundingClientRect()`, `getClientRects()`

**Window/document:** `window.innerWidth`, `window.innerHeight`, `window.scrollX`, `window.scrollY`, `document.scrollingElement`

**Input-related:** `elem.focus()` (triggers layout to scroll element into view), `elem.select()`, `Range.getClientRects()`

Reference: Paul Irish's "What forces layout/reflow" gist documents 40+ properties and methods.

### Worked Example: Trello-Style Board Drag Handler

A Trello-style kanban board had 200ms drag handler lag. The drag handler read `offsetTop` for each card to determine drop position, then set `style.top` on the dragged card — creating a read-write-read-write loop across 50 cards per column:

```javascript
// BEFORE: 200ms per drag frame (layout thrashing)
cards.forEach((card) => {
  if (card.offsetTop > dragY) {
    // read: forces layout
    card.style.marginTop = '80px'; // write: invalidates layout
  }
});

// AFTER: 4ms per drag frame (batched)
const positions = cards.map((c) => c.offsetTop); // one layout
requestAnimationFrame(() => {
  cards.forEach((card, i) => {
    if (positions[i] > dragY) {
      card.style.marginTop = '80px';
    }
  });
});
```

The fix reduced frame time from 200ms to 4ms — a 50x improvement.

### Worked Example: Google Maps Layout Containment

Google Maps uses `contain: layout` on each map tile element. When a tile updates (new imagery loads, label changes), layout recalculation is contained to that single tile. Without containment, each tile update would trigger layout for the entire map container and all its siblings. With 50-100 visible tiles, containment reduces layout scope from the full document to a single 256x256px element.

### The Layout Tree

The layout tree is not the same as the DOM tree. It excludes elements with `display: none` (they have no layout box), includes pseudo-elements (`::before`, `::after`), and has a different structure for flex and grid containers (flex items become direct children of the flex container in the layout tree regardless of DOM nesting of anonymous boxes). Understanding this distinction matters: adding `display: none` to an element removes it from the layout tree entirely — no layout cost — while `visibility: hidden` keeps it in the layout tree occupying space.

### Anti-Patterns

**Reading `offsetWidth`/`offsetHeight` inside animation loops.** Each read forces layout if any style has changed since the last layout. At 60fps, this means 60 forced layouts per second, each potentially costing 10-50ms on complex pages.

**Toggling CSS classes that change geometry on many elements without batching.** Adding a class that changes `padding` on 100 elements triggers layout for each class change if done synchronously. Use `requestAnimationFrame` to batch all changes into a single frame.

**Using `getComputedStyle()` to read layout properties after style changes.** `getComputedStyle(el).height` forces both style recalculation and layout if styles are dirty. Batch reads before writes.

**Animating `width`/`height`/`top`/`left` instead of `transform`.** Layout-triggering properties force the browser through Layout + Paint + Composite on every frame. `transform: translate()` and `transform: scale()` skip Layout and Paint entirely, running only on the compositor thread.

```css
/* BAD — triggers layout on every frame */
.animate {
  transition:
    left 0.3s,
    top 0.3s;
}

/* GOOD — compositor-only, skips layout and paint */
.animate {
  transition: transform 0.3s;
}
```

**Using `element.scrollIntoView()` inside loops.** Each call forces layout to compute scroll position. In a loop processing multiple elements, this creates severe layout thrashing.

## Source

- Paul Irish, "What forces layout/reflow" — https://gist.github.com/paulirish/5d52fb081b3570c81e3a
- CSS Containment Module Level 2 — https://www.w3.org/TR/css-contain-2/
- Chrome DevTools Layout Shift documentation
- Google Developers: "Avoid Large, Complex Layouts and Layout Thrashing" — https://web.dev/articles/avoid-large-complex-layouts-and-layout-thrashing

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
- No forced synchronous layout warnings appear in DevTools during critical interactions.
- Layout computation stays under 4ms per frame during animations and interactions.
