# Style Calculation

> Understand CSS selector matching, style invalidation, and recalculation costs — how browsers resolve computed styles for every visible element, why some selectors are orders of magnitude more expensive than others, and how to keep style recalculation under 4ms per frame.

## When to Use

- Chrome DevTools Performance panel shows long "Recalculate Style" events exceeding 4ms
- Adding or removing a CSS class triggers style recalculation on thousands of elements
- The page has more than 1,000 CSS rules and style recalculation is a bottleneck
- You are choosing between deeply nested BEM selectors and flat utility-class architectures
- Toggling a class on `<body>` or `<html>` causes a full-page style invalidation
- CSS Containment (`contain: style`) could isolate style recalculation to subtrees
- A component library uses complex selectors like `:nth-child()` or `*` in compound selectors
- DevTools shows "Recalculate Style" as a significant portion of a long task
- Style recalculation during scroll or animation is causing frame drops below 60fps
- You need to decide between CSS-in-JS runtime injection and static CSS extraction

## Instructions

1. **Profile style recalculation cost.** Open Chrome DevTools Performance panel. Record an interaction. Click on any purple "Recalculate Style" bar. The summary shows the number of elements affected and the time spent. Target: under 4ms for 60fps (you have ~10ms of JS budget per frame; style recalculation should consume less than half).

2. **Understand right-to-left selector matching.** Browsers evaluate selectors from right to left. For `.sidebar .nav ul li a`, the browser first finds all `<a>` elements (the key selector), then checks if each has an `<li>` parent, then `<ul>`, then `.nav`, then `.sidebar`. The key selector (rightmost) determines initial candidate set size.

   ```css
   /* SLOW — key selector `a` matches every link on the page,
      then walks up 4 ancestors for each */
   .sidebar .nav ul li a {
     color: blue;
   }

   /* FAST — key selector `.sidebar-link` matches only targeted elements,
      no ancestor walking needed */
   .sidebar-link {
     color: blue;
   }
   ```

3. **Reduce selector complexity.** Aim for flat, single-class selectors. Each additional combinator (descendant, child, sibling) adds ancestor-walking cost:

   ```css
   /* O(elements * ancestors) — expensive */
   .feed .card .content .text p {
     margin: 0;
   }

   /* O(elements) — direct match, no tree walking */
   .feed-text {
     margin: 0;
   }
   ```

4. **Minimize style invalidation scope.** When you add or remove a class, the browser must determine which elements' computed styles might change. Adding a class to `<body>` invalidates styles for the entire document. Adding a class to a leaf element invalidates only that element.

   ```javascript
   // BAD — invalidates styles for every element in the document
   document.body.classList.toggle('dark-mode');

   // BETTER — invalidates only the subtree
   document.querySelector('.app-container').classList.toggle('dark-mode');
   ```

5. **Use CSS Containment to create style boundaries.** `contain: style` (part of `contain: strict` or `contain: content`) prevents style changes inside a container from triggering recalculation outside it.

   ```css
   .widget {
     contain: layout style; /* Style changes inside do not affect siblings or ancestors */
   }
   ```

6. **Adopt atomic CSS for maximum selector performance.** Atomic CSS (Tailwind, Stylex, Linaria extracted) maps each class to exactly one CSS property. Selector matching becomes O(1) per property because each class is unique and directly mapped.

   ```html
   <!-- Atomic: each class = one property, O(1) matching per class -->
   <div class="flex items-center gap-4 p-2 bg-white rounded-lg shadow-sm">
     <!-- Semantic: selector .card-header matches, then cascade resolves 8 properties -->
     <div class="card-header"></div>
   </div>
   ```

## Details

### Selector Matching Cost Model

Style recalculation cost is approximately: `O(elements_affected * selectors_evaluated)`. For a page with 2,000 elements and 3,000 selectors, a full recalculation evaluates up to 6 million selector-element pairs. Browsers optimize with Bloom filters (Blink) and rule hash tables (WebKit) that skip obviously non-matching selectors, but complex selectors defeat these optimizations.

Selector types ranked by matching cost (fastest to slowest):

1. **ID selectors** (`#header`) — hash lookup, O(1)
2. **Class selectors** (`.nav-item`) — hash lookup, O(1)
3. **Tag selectors** (`div`) — hash lookup, O(1)
4. **Universal selector** (`*`) — matches everything, no filtering
5. **Attribute selectors** (`[data-active]`) — linear scan in some engines
6. **Pseudo-classes** (`:nth-child(3)`) — requires counting siblings
7. **Descendant combinators** (`.a .b .c`) — requires ancestor tree walking

### Worked Example: LinkedIn Feed Optimization

LinkedIn's feed page had 50ms "Recalculate Style" events when loading new posts. The root cause: selectors like `.feed-container .feed-card .card-content .text-body p` required walking 4 ancestor levels for every `<p>` element. With 200 feed cards and 800 paragraphs, each style invalidation evaluated 800 \* 4 ancestor levels. The fix: flattening to `.feed-text-body` reduced recalculation to 8ms — a 6x improvement — because the single-class selector matched directly without tree walking.

### Worked Example: Facebook Atomic CSS (Stylex)

Facebook uses Stylex, their atomic CSS-in-JS framework, where each class maps to exactly one CSS declaration. A button with `color: blue; padding: 8px; border-radius: 4px` gets three atomic classes. Selector matching becomes O(1) per property because each class is a direct hash lookup with no combinators. On pages with 50,000+ elements, this architecture eliminated style recalculation as a performance bottleneck — recalculation times stayed under 2ms regardless of page complexity.

### Style Invalidation Deep Dive

When a DOM mutation occurs (class change, attribute change, element insertion), the browser must determine which elements need their styles recalculated. Modern browsers use "style invalidation sets" — precomputed data structures that map mutations to affected selectors.

Types of invalidation:

- **Self invalidation** — only the mutated element (class change on a leaf element)
- **Descendant invalidation** — the element and all descendants (class change on an ancestor with descendant selectors)
- **Sibling invalidation** — siblings and their subtrees (`:nth-child`, `~`, `+` selectors)
- **Document-wide invalidation** — every element (class change on `<body>` with descendant selectors)

### Anti-Patterns

**Universal selectors in compound selectors.** `*.active` or `div *` forces the engine to evaluate against every element, defeating Bloom filter optimizations. The universal selector produces the largest possible initial candidate set.

**Deeply nested descendant selectors.** `.a .b .c .d .e` triggers expensive tree walks for each candidate element. Each descendant combinator requires walking up ancestors until a match is found or the root is reached. With a DOM depth of 30, each evaluation walks up to 30 ancestors per combinator.

**`:nth-child` on large sibling lists.** `:nth-child(2n+1)` requires counting siblings for each candidate element. On a list with 500 items, each evaluation counts up to 500 siblings. Sibling invalidation is also expensive — inserting a new sibling invalidates `:nth-child` for all existing siblings.

**Adding/removing classes on `<body>`.** If any selector in the stylesheet uses `.body-class .something`, toggling a class on `<body>` forces descendant invalidation for every element in the document. Scope the class change to the smallest possible subtree.

**Overusing `getComputedStyle()` in loops.** `window.getComputedStyle(el)` forces style recalculation if styles are dirty. Calling it inside a loop that also modifies styles creates a read-write-read-write pattern that triggers recalculation on every iteration:

```javascript
// BAD — forces style recalculation on every iteration
elements.forEach((el) => {
  el.style.width = '100px';
  const height = getComputedStyle(el).height; // forces recalc
});

// GOOD — batch reads, then batch writes
const heights = elements.map((el) => getComputedStyle(el).height);
elements.forEach((el, i) => {
  el.style.width = '100px';
});
```

**CSS-in-JS runtime style injection.** Frameworks that inject `<style>` tags at runtime force the browser to reparse the stylesheet and recompute styles for the entire document. This is especially expensive in hot paths like list rendering. Prefer static extraction (Linaria, vanilla-extract) or atomic CSS approaches.

## Source

- Google Developers: "Reduce the Scope and Complexity of Style Calculations" — https://web.dev/articles/reduce-the-scope-and-complexity-of-style-calculations
- Blink Style Invalidation documentation — https://chromium.googlesource.com/chromium/src/+/HEAD/third_party/blink/renderer/core/css/style-invalidation.md
- CSS Containment Module Level 2 — https://www.w3.org/TR/css-contain-2/
- Rune Lillesveen, "Style Invalidation in Blink" (BlinkOn talk)

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
- Style recalculation time is measured in DevTools and stays under 4ms per frame.
- Selectors are flat and avoid unnecessary descendant combinators.
