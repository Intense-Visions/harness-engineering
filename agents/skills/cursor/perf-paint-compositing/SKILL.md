# Paint and Compositing

> Understand the browser's paint and compositing pipeline — how content is rasterized into layers, which properties trigger expensive repaints, how GPU compositing enables 60fps animations, and how to manage layer promotion without exhausting GPU memory.

## When to Use

- Animations run below 60fps and DevTools shows green "Paint" blocks in the flame chart
- The Layers panel in DevTools shows an unexpected number of composited layers
- GPU memory usage is high and you suspect excessive layer promotion
- You are choosing between animating `left`/`top` versus `transform: translate()`
- `will-change` is applied to many elements and you need to understand the memory trade-off
- Scroll performance is poor and DevTools shows paint operations during scroll
- Complex visual effects (shadows, gradients, filters) cause frame drops
- Mobile devices show worse animation performance than desktop despite similar logic
- You need to understand which CSS properties are "compositor-only" and skip the main thread
- A page with many animated elements needs a layer management strategy

## Instructions

1. **Understand the two-thread model.** The browser has a main thread (runs JavaScript, style, layout, paint records) and a compositor thread (composites layers, handles scroll, runs transform/opacity animations). Properties that only affect compositing (`transform`, `opacity`) animate on the compositor thread without blocking JavaScript execution.

2. **Identify compositor-only properties.** Only these CSS properties can be animated without triggering layout or paint:
   - `transform` — translate, scale, rotate, skew (GPU-composited)
   - `opacity` — alpha blending on the GPU
   - `filter` — GPU-accelerated in most browsers (but check paint in DevTools)
   - `backdrop-filter` — composited but expensive on mobile

   ```css
   /* EXPENSIVE — triggers Layout + Paint + Composite every frame */
   .slide {
     transition:
       left 0.3s,
       top 0.3s;
   }

   /* CHEAP — Composite only, runs on compositor thread */
   .slide {
     transition: transform 0.3s;
   }
   ```

3. **Promote elements to their own layer deliberately.** Layer promotion moves an element to a separate GPU texture, allowing the compositor to animate it independently. Promote with:

   ```css
   /* Promote only when animation is about to start */
   .card.will-animate {
     will-change: transform;
   }

   /* Alternative: 3D transform hack (older technique) */
   .promoted {
     transform: translateZ(0);
   }
   ```

4. **Remove `will-change` after animations complete.** Each promoted layer consumes GPU memory (the element is rasterized to a separate texture). Remove the hint when not needed:

   ```javascript
   element.addEventListener('mouseenter', () => {
     element.style.willChange = 'transform';
   });
   element.addEventListener('transitionend', () => {
     element.style.willChange = 'auto';
   });
   ```

5. **Use the Layers panel to audit composited layers.** In Chrome DevTools, open the Layers panel (More tools > Layers). Each green-outlined rectangle is a composited layer. Check:
   - Total layer count (target: fewer than 30 on mobile)
   - Layer sizes (large layers consume significant GPU memory)
   - Compositing reasons (shown when selecting a layer)

6. **Reduce paint complexity.** Some CSS properties are expensive to paint:
   - `box-shadow` — especially with large blur radius (>10px), painted per frame during animation
   - `border-radius` with `overflow: hidden` — requires clipping mask
   - CSS `filter: blur()` — full-surface Gaussian blur
   - Complex `background: linear-gradient()` — repainted on size changes

   Prefer pre-rendered images or SVGs for complex visual effects that change frequently.

## Details

### Paint and Rasterization Architecture

After layout, the browser creates a "paint record" — an ordered list of drawing commands (draw rectangle, draw text, draw image). This record is then rasterized into pixels. Modern browsers use two rasterization strategies:

- **Software rasterization** — CPU draws pixels into a bitmap. Used for simple content. Blink uses Skia as the rasterization engine.
- **GPU rasterization** — Drawing commands are sent to the GPU via OpenGL/Vulkan/Metal. Used for complex content, transforms, and promoted layers. Faster for large areas but has texture upload overhead.

Rasterization is tiled: the page is divided into 256x256px tiles, and only visible tiles are rasterized. During scroll, new tiles are rasterized on background threads (off-main-thread rasterization).

### Worked Example: Airbnb Parallax Scroll

Airbnb's listing page had a parallax hero image that animated at 15fps on mobile. The implementation used `background-position` to create the parallax effect, which triggers paint on every scroll frame because the browser must re-rasterize the background at a new position.

```css
/* BEFORE: 15fps — triggers paint on every scroll frame */
.hero {
  background-position: center calc(50% + var(--scroll-offset));
}

/* AFTER: 60fps — compositor-only, no paint */
.hero-image {
  will-change: transform;
  transform: translate3d(0, var(--scroll-offset), 0);
}
```

The fix moved from `background-position` (paint per frame) to `transform: translate3d()` (compositor-only). Frame rate went from 15fps to 60fps because the compositor thread handles the transform without involving the main thread.

### Worked Example: Dashboard Layer Memory Explosion

A real-time dashboard applied `will-change: transform` to all 50 chart widgets for smooth updates. Each widget was 400x300px at 2x device pixel ratio, creating 50 layers at 400*300*4\*4 = 1.92MB each (RGBA, 2x DPR) = 96MB of GPU memory just for chart layers. On mobile devices with 256MB GPU memory budget, this caused texture eviction and janky re-rasterization.

Fix: apply `will-change` only to the chart currently being updated, remove it after the update animation completes. GPU memory dropped from 96MB to ~4MB (2 active layers at any time).

### Layer Promotion Triggers

Elements are promoted to their own composited layer when:

- `will-change: transform`, `will-change: opacity`, or `will-change: filter` is set
- 3D transforms are applied (`transform: translate3d()`, `transform: translateZ()`)
- `<video>`, `<canvas>`, or `<iframe>` elements (always composited)
- `position: fixed` or `position: sticky` elements
- An element overlaps an already-composited layer (implicit promotion to maintain correct z-order)
- CSS animations or transitions on `transform` or `opacity`

Implicit promotion (overlap-based) is a common source of unexpected layer count increases. Use the Layers panel to identify "compositing reason: overlaps other composited content."

### Anti-Patterns

**Blanket `will-change: transform` on all elements.** Each promoted layer is rasterized to a separate GPU texture. Applying `will-change` to 50+ elements on a page with no active animations wastes GPU memory and can cause worse performance than no promotion at all due to texture management overhead.

**Animating `box-shadow` directly.** `box-shadow` triggers paint on every frame. For animated shadows, use a pseudo-element with the shadow pre-applied and animate its `opacity`:

```css
.card {
  position: relative;
}
.card::after {
  content: '';
  position: absolute;
  inset: 0;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  opacity: 0;
  transition: opacity 0.3s;
}
.card:hover::after {
  opacity: 1;
}
```

**Excessive layer count on mobile.** Mobile GPUs have limited texture memory (128-512MB shared across all apps). More than 30 composited layers on mobile risks texture eviction, where the GPU must re-upload textures from main memory, causing visible jank during scroll or animation.

**`backface-visibility: hidden` hack applied globally.** This was a common trick to force GPU compositing, but applying it to all elements creates unnecessary layers, wastes GPU memory, and can cause text rendering differences (subpixel antialiasing is disabled on composited layers in some browsers).

**Animating `border-radius` or `clip-path` directly.** These trigger paint recalculation per frame. Instead, pre-create the clipped shape and animate `transform` or `opacity` on the container.

## Source

- Chrome Compositing documentation — https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/
- Surma, "The Anatomy of a Frame" (Google) — https://aerotwist.com/blog/the-anatomy-of-a-frame/
- Paul Lewis, "Stick to Compositor-Only Properties" — https://web.dev/articles/stick-to-compositor-only-properties-and-manage-layer-count
- Chromium GPU Architecture documentation

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
- Animations use compositor-only properties and achieve 60fps in DevTools Performance panel.
- GPU memory usage is monitored and layer count stays under budget.
