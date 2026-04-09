# Parallax & Scroll Effects

> Scroll-driven depth — rate-differential parallax, scroll-triggered reveals, sticky sections, scroll narrative, performance constraints, motion sensitivity

## When to Use

- Building marketing or landing pages where scroll position drives visual storytelling
- Implementing layered backgrounds that move at different rates to create depth
- Designing scroll-triggered content reveals (fade-in on scroll, slide-up on enter viewport)
- Building sticky section headers, navigation bars, or progress indicators that respond to scroll position
- Creating immersive product showcases where scroll acts as a timeline or progression control
- Evaluating whether a scroll effect is enhancing comprehension or just adding visual noise
- Implementing scroll-linked animations with the CSS Scroll-Driven Animations API or Intersection Observer
- Any situation where the scroll position should control visual state beyond simple content displacement

## Instructions

1. **Understand rate-differential parallax as the core mechanism.** Parallax is the perception of depth created when visual layers move at different speeds relative to the viewer's motion. In scroll-driven parallax, the "viewer's motion" is the scroll position. Background layers move slower than the scroll rate (creating depth — they appear "far away"), foreground layers move faster than the scroll rate (creating proximity — they appear "close"). The speed ratio determines perceived depth: a background at 0.3x scroll speed appears distant; a foreground at 1.5x appears close. A midground at 1.0x moves with normal scroll. Stripe's marketing pages use a 3-layer system: background illustrations at 0.3x, content cards at 1.0x (normal), and decorative floating elements at 0.7x — the differential between 0.3x and 0.7x creates perceivable depth without aggressive motion.

2. **Limit parallax rate differentials to prevent motion sickness.** The maximum comfortable rate differential is 0.5x (one layer moves at half the speed of another). Differentials above 0.5x create rapid visual displacement that triggers vestibular discomfort in approximately 35% of adults over 40. Safe ranges:
   - **Subtle depth (recommended):** Background at 0.8x, content at 1.0x. Differential: 0.2x. Barely perceptible but creates subconscious depth. Suitable for all audiences.
   - **Moderate depth:** Background at 0.5x, content at 1.0x. Differential: 0.5x. Clearly visible parallax. Must have `prefers-reduced-motion` alternative.
   - **Aggressive depth (use sparingly):** Background at 0.2x, foreground at 1.3x. Differential: 1.1x. Strong parallax for hero sections only. Must be limited to a single viewport height. Must have `prefers-reduced-motion` alternative. Apple's tvOS uses aggressive parallax on app icons (foreground shifts up to 30px relative to background), but the effect is bounded to a small surface area — a 400x240px card, not a full screen.

3. **Implement scroll-triggered reveals with Intersection Observer, not scroll events.** Scroll event listeners fire on every frame during scrolling (~60-120 times per second), consuming main thread budget. Intersection Observer is asynchronous, fires only at threshold crossings, and does not block the main thread. The standard reveal pattern:

   ```javascript
   const observer = new IntersectionObserver(
     (entries) => {
       entries.forEach((entry) => {
         if (entry.isIntersecting) {
           entry.target.classList.add('revealed');
           observer.unobserve(entry.target); // One-shot reveal
         }
       });
     },
     { threshold: 0.15, rootMargin: '0px 0px -50px 0px' }
   );
   ```

   The `threshold: 0.15` means the element is revealed when 15% visible — early enough that the animation completes before the element is fully in view. The `rootMargin: '0px 0px -50px 0px'` shrinks the bottom of the observation area by 50px, preventing elements right at the viewport edge from triggering. Vercel uses this exact pattern: section headings and feature cards fade up from 20px below their resting position over 400ms with `ease-out` when they cross the 15% visibility threshold.

4. **Design scroll narrative as a three-act structure.** Scroll-driven pages are temporal experiences — the user's scroll position is the timeline. Structure the narrative:
   - **Act 1 (Hero, 0-100vh):** Establish context. Full-viewport hero with primary message. Minimal parallax — the user has not committed to scrolling yet. Apple's product pages start with a static hero image and a single headline.
   - **Act 2 (Features, 100vh-N\*100vh):** Deliver value. Each scroll section reveals a feature or benefit. Use sticky sections (the section pins while content scrolls through it) to create controlled reading pace. Stripe's "Payments" page uses sticky phone mockups that update as the user scrolls through feature descriptions.
   - **Act 3 (Resolution, final 100vh):** Call to action. The scroll narrative concludes with a clear next step. Reduce motion complexity — the user should focus on the CTA, not be distracted by animations. Vercel's landing pages end with a clean, static pricing/signup section after elaborate scroll-driven feature reveals.

5. **Implement sticky sections for pacing control.** Sticky positioning (`position: sticky; top: 0`) pins an element within its scrolling container. Use sticky sections to create "scroll-through" experiences where a visual element stays fixed while text content scrolls alongside it. The implementation pattern:

   ```css
   .sticky-container {
     display: grid;
     grid-template-columns: 1fr 1fr;
     min-height: 300vh; /* 3x viewport height for scroll-through */
   }
   .sticky-visual {
     position: sticky;
     top: 0;
     height: 100vh;
   }
   .scrolling-content {
     padding: 100vh 0; /* Space above and below for scroll room */
   }
   ```

   The sticky visual occupies the left half of the screen while the right half scrolls through 3 viewports of content. Material Design's component documentation pages use this pattern: a live component preview stays sticky on the left while specifications scroll on the right. Apple's iPhone product pages use a variation: a phone image stays sticky-centered while feature text sections scroll past it, with the phone screen updating to match the current feature.

6. **Use the CSS Scroll-Driven Animations API for performance-critical scroll effects.** The Scroll-Driven Animations API (Chrome 115+, progressive enhancement for other browsers) moves scroll-linked animations entirely off the main thread. Instead of JavaScript scroll listeners that calculate and apply transforms per frame, the browser's compositor handles the animation directly:

   ```css
   @keyframes parallax-shift {
     from {
       transform: translateY(0);
     }
     to {
       transform: translateY(-100px);
     }
   }
   .parallax-bg {
     animation: parallax-shift linear;
     animation-timeline: scroll();
     animation-range: 0vh 100vh;
   }
   ```

   This achieves jank-free parallax without any JavaScript. The `animation-timeline: scroll()` binds the animation progress to scroll position. The `animation-range` defines which scroll range maps to the animation's 0%-100%. For browsers without support, fall back to Intersection Observer for reveal effects and accept static backgrounds. Do not fall back to JavaScript scroll listeners for parallax — the performance cost is not worth the effect.

7. **Always provide a complete `prefers-reduced-motion` alternative.** Parallax and scroll-triggered animations are among the most motion-sickness-inducing patterns in web design. The reduced-motion implementation must:
   - **Eliminate all parallax.** All layers move at 1.0x scroll speed (normal scrolling).
   - **Replace reveals with pre-revealed state.** Elements that would fade-in-on-scroll appear immediately in their final position.
   - **Keep sticky sections.** Sticky positioning is not motion — it is a layout pattern. Sticky sections can remain in reduced-motion mode.
   - **Remove scroll-driven animations.** Any animation tied to scroll position is eliminated. Content is visible in its final state.

   ```css
   @media (prefers-reduced-motion: reduce) {
     .parallax-bg {
       animation: none;
       transform: none;
     }
     .reveal-on-scroll {
       opacity: 1;
       transform: none;
     }
     /* Sticky sections remain unchanged */
   }
   ```

   Apple's macOS System Preferences demonstrates this: when "Reduce motion" is enabled, all parallax effects on Apple's marketing pages are disabled. Content appears in its final state with no scroll-linked position changes.

8. **Performance-budget scroll effects strictly.** Scroll-driven animations must maintain 60fps (16.67ms per frame) without exception. The budget:
   - **Compositor-only properties:** Only animate `transform` and `opacity` in response to scroll. No `background-position` animation (triggers paint), no `filter` animation (triggers paint), no dimension animations (`width`, `height` — trigger layout).
   - **Layer count:** No more than 5 composited layers for parallax. Each layer with `will-change: transform` consumes GPU memory. On a mobile device with 512MB GPU memory, each full-viewport layer can consume 8-12MB. Five layers = 40-60MB — near the limit for low-end devices.
   - **Image optimization:** Parallax background images must be decoded and GPU-resident. Use `<img loading="eager">` for parallax images (not `lazy`, which causes pop-in on scroll). Size images to 1.5x the container size to accommodate parallax travel without exposing edges.
   - **Avoid `background-attachment: fixed`.** This CSS property creates a pseudo-parallax effect but forces the entire page to repaint on every scroll frame. Performance is catastrophic on mobile and poor on desktop. Modern Chrome no longer hardware-accelerates `background-attachment: fixed`. Use `transform: translateY()` with Scroll-Driven Animations API instead.

## Details

### Scroll Position as a Design Variable

Scroll position is a continuous input (0 to max-scroll-height) that can drive any visual property. The key insight: scroll is not just navigation — it is an input device, like a slider. Effective scroll-driven design treats scroll position as a value that maps to visual states:

**Linear mapping:** `visualProperty = scrollPosition * rate`. The property changes proportionally with scroll. Used for parallax (position changes linearly with scroll) and progress indicators (a bar fills proportionally as the user scrolls through a page).

**Threshold mapping:** `visualProperty = scrollPosition > threshold ? stateB : stateA`. The property snaps between two states at a scroll position. Used for sticky navigation (transparent to opaque at scroll > 50px), scroll-triggered reveals (hidden to visible at element-in-viewport), and header collapse (full header to compact header at scroll > 200px).

**Range mapping:** `visualProperty = clamp(0, (scrollPosition - start) / (end - start), 1) * valueRange`. The property interpolates between two values within a scroll range, then holds steady outside that range. Used for scroll-linked animations within a specific page section. The CSS Scroll-Driven Animations API's `animation-range` implements this directly.

### Sticky Section Patterns

**Sticky sidebar with scrolling content.** The standard documentation/marketing pattern. One column is sticky (visual, navigation, or media), the other scrolls. The sticky column's height must equal `100vh` — if it exceeds the viewport, the bottom will be clipped. If sticky content is taller than the viewport, use `overflow-y: auto` on the sticky element to make it independently scrollable.

**Sticky-then-scroll (pin-and-release).** A section pins at the top of the viewport for a specific scroll range, then releases and scrolls normally. Implementation: the section's container has height = `100vh + pinDuration`. The section has `position: sticky; top: 0; height: 100vh`. While the user scrolls through the container's excess height (`pinDuration`), the section stays pinned. Once the container scrolls past, the section releases. Apple's product pages use this extensively: a phone image pins while 3 feature descriptions scroll through, then the phone releases and the next section enters.

**Sticky header with progressive collapse.** A navigation bar that compresses from full height (80px) to compact height (48px) as the user scrolls. Implementation: use `scroll()` timeline to animate `height`, `padding`, and `font-size` between scroll positions 0 and 200px. This creates a "shrinking header" that preserves navigation access while reclaiming vertical space. Stripe's documentation site collapses its header from a full logo + navigation to a compact bar with a hamburger menu.

### Scroll Performance Debugging

**Diagnosing jank.** Open Chrome DevTools > Performance > Record while scrolling. Look for:

- **Long tasks (>50ms)** on the main thread during scroll — indicates JavaScript scroll listeners doing too much work.
- **Paint events** during scroll — indicates non-compositor properties being animated.
- **Layout events** during scroll — indicates dimension/position properties being animated.

**Common jank sources:**

1. `background-attachment: fixed` — forces repaint on every scroll frame. Replace with `transform`-based parallax.
2. `box-shadow` animated on scroll — triggers paint. Use `filter: drop-shadow()` or pre-rendered shadow layers.
3. `element.getBoundingClientRect()` in scroll handlers — triggers forced synchronous layout. Cache values and use Intersection Observer instead.
4. Unthrottled scroll listeners — fire 60-120 times per second. If you must use scroll listeners (no Scroll-Driven Animations support), use `requestAnimationFrame` to batch reads and writes.

### Anti-Patterns

1. **Scroll Hijacking.** Overriding the browser's native scroll behavior to control scroll speed, snap to sections, or change scroll direction. This breaks the user's fundamental expectation of how scrolling works. Users who use trackpads, mice, touchscreens, keyboards (Page Up/Down), and assistive devices all have different scroll velocities and expectations. Overriding any of them creates frustration. Specific violations: `event.preventDefault()` on wheel events, `scroll-snap-type: y mandatory` on the document (not containers), custom scroll velocity multipliers, horizontal scroll triggered by vertical wheel input. Fix: use native scroll behavior. Use `scroll-snap-type` only on bounded containers (carousels, galleries), never on the document root. If sections need to "snap," use `scroll-snap-type: y proximity` which suggests snapping but does not force it.

2. **Perpetual Animation Loops on Scroll.** Attaching infinite CSS animations (`animation-iteration-count: infinite`) to elements and using scroll position only to toggle their visibility. The animation runs whether or not the user is looking at it, consuming GPU cycles for off-screen elements. Fix: use Intersection Observer to add/remove animation classes when elements enter/leave the viewport. Alternatively, use `animation-play-state: paused` by default and set `running` when in view.

3. **Parallax on Mobile Without Touch Consideration.** Mobile scroll is fundamentally different from desktop — it uses momentum-based inertia (the page continues scrolling after the finger lifts), rubber-banding at scroll boundaries, and 120Hz refresh on modern devices. Parallax that looks smooth at 60fps on desktop may stutter at 120fps on mobile because the animation calculations cannot keep pace with the faster refresh rate. Fix: disable parallax on mobile entirely (`@media (hover: none) { .parallax { transform: none; } }`) or use the CSS Scroll-Driven Animations API which is compositor-driven and refresh-rate-independent. Many production sites (Apple, Stripe) disable parallax on mobile viewports.

4. **Edge Exposure.** When a parallax layer moves slower than the scroll rate, it travels less than the content. If the layer is exactly viewport-sized, scrolling reveals the edge of the image. The user sees a gap — a colored background or the end of an image — where the parallax layer does not cover. Fix: size parallax images to cover the maximum travel distance. For a background at 0.5x scroll speed on a viewport of 900px, the background must be at least `900px + (900px * 0.5) = 1350px` tall. General formula: `image_height = viewport_height + (scroll_distance * (1 - parallax_rate))`.

5. **Reveal Fatigue.** Every single element on the page fades in on scroll — headings, paragraphs, images, buttons, dividers, icons, badges. The first few reveals feel polished. By the twentieth, the user is waiting for content to appear rather than reading it. The page feels like it is loading slowly, not revealing elegantly. Fix: limit reveals to major section entries (3-5 per page). Body text, inline images, and secondary UI elements should be present in the DOM without animation. Reserve reveals for moments of narrative emphasis — a key statistic, a product screenshot, a testimonial quote.

### Real-World Examples

**Apple's iPhone Product Pages.** Apple's product marketing pages are the reference implementation for scroll-driven narrative. The page is structured as a linear story: hero image (static, full bleed), followed by 4-6 feature sections. Each feature section uses a sticky phone mockup on center-screen while feature descriptions scroll alongside. As the user scrolls through a feature section, the phone screen transitions (crossfade, 300ms) to show the relevant feature. The parallax is subtle — background gradients shift at approximately 0.85x scroll speed, a 0.15x differential that creates depth without triggering motion sensitivity. On mobile, parallax is disabled entirely; the page uses sequential full-bleed images instead. All scroll-linked animations respect `prefers-reduced-motion` — with reduced motion enabled, phone screens swap instantly and gradients are static.

**Stripe's Multi-Layer Marketing Parallax.** Stripe's homepage uses a 4-layer depth system: a distant grid pattern (0.3x scroll speed), mid-ground gradient orbs (0.6x), content sections (1.0x, normal), and foreground code snippets that float above content (1.15x on desktop). The differential between layers creates a convincing sense of depth. The grid pattern uses CSS Scroll-Driven Animations API where supported and falls back to `transform: translate3d()` updated via `requestAnimationFrame` elsewhere. Stripe limits parallax to the first 3 viewports of the page — deeper sections use standard scroll behavior, creating a natural transition from "immersive showcase" to "informational content."

**Vercel's Section Reveal System.** Vercel's landing page uses scroll-triggered reveals with a consistent pattern: each major section (feature cards, code examples, deployment previews) fades in from 20px below its final position with 400ms `ease-out` when 15% visible (Intersection Observer with `threshold: 0.15`). Within each section, elements stagger: heading at 0ms, subheading at 60ms, visual at 120ms, and CTA at 180ms. Total entrance time per section: ~580ms. The reveals are one-shot (`observer.unobserve()` after trigger) — scrolling back up shows the elements in their final state, not the pre-reveal state. On `prefers-reduced-motion`, all elements appear in their final state immediately.

**Spotify's Album Art Parallax.** In Spotify's mobile Now Playing view, the album art uses a subtle parallax effect when scrolling between the album art and the track list. The album art scales from 1.0 to 0.85 and shifts upward at 0.7x scroll rate as the track list scrolls up to replace it. The background gradient (sampled from the album art colors) fades from full opacity to 40% as the list appears, creating a smooth transition from visual-focused (album art) to text-focused (track list) context. The parallax rate of 0.7x (0.3x differential) is within the comfortable range. On iOS, this uses UIKit's scroll view delegate for 120Hz-synchronized updates. With reduced motion enabled, the album art crossfades to the track list without position animation.

## Source

- CSS Scroll-Driven Animations Specification — https://www.w3.org/TR/scroll-animations-1/
- Intersection Observer API — https://www.w3.org/TR/intersection-observer/
- Apple — Product page scroll design patterns (iPhone, Mac product pages)
- Stripe — Marketing page parallax implementation (DevTools analysis)
- Material Design — Scrolling behavior documentation
- Google Web Fundamentals — "Performant Parallaxing" (Paul Lewis, 2016)
- CSS `position: sticky` specification — https://www.w3.org/TR/css-position-3/#sticky-pos
- Web.dev — "Scroll-driven animations" (Bramus Van Damme, 2023)
- Vestibular Disorders Association — Motion sensitivity and scroll-linked animation guidance
- Chrome DevTools — Performance profiling for scroll jank diagnosis

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
