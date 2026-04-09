# Gestalt Common Fate

> Motion grouping — elements that move or change together are perceived as a unit, with implications for animation, loading states, and batch operations

## When to Use

- Designing animations where multiple elements should feel like a single group
- Building loading states, skeleton screens, and shimmer effects
- Implementing batch operations (select all, bulk delete, multi-drag)
- Creating carousel, slider, and horizontal scroll interactions
- Designing coordinated state transitions (page transitions, tab switches, expand/collapse)
- Evaluating why an animation feels disconnected or a batch operation feels like separate actions

## Instructions

1. **Understand the law.** The Gestalt principle of common fate states that elements moving in the same direction, at the same speed, at the same time are perceived as a single group. This principle extends beyond literal motion to any synchronized change: opacity transitions, color shifts, scale transforms. If elements change together, they are perceived as a unit. If one element changes while others remain static, it is perceived as separate from the group.

   **Why this matters for interfaces:** Digital interfaces are temporal — they change over time. Every animation, transition, and state change is an opportunity to communicate grouping through common fate. A well-designed animation tells the user "these things belong together" just as powerfully as proximity or similarity.

2. **Synchronize grouped elements in animations.** When elements belong to the same group, their animations must share timing parameters: same duration, same easing curve, same delay. Any deviation breaks common fate and makes the elements read as independent.

   **Worked example — Spotify horizontal card carousel:**
   - When the user swipes, all visible cards translate horizontally by the same distance, at the same speed, with the same easing curve (`cubic-bezier(0.25, 0.1, 0.25, 1.0)`)
   - This synchronized horizontal movement makes 5-6 cards feel like a single ribbon of content
   - If one card moved faster than the others (even by 50ms), it would "detach" from the group perceptually
   - New cards entering from the edge share the same velocity — they are immediately perceived as part of the group

   **Worked example — Material Design container transform:**
   - When a card expands to a detail view, the card's content (title, image, description) transforms together
   - All child elements share the same timing: `duration: 300ms`, `easing: emphasized-decelerate`
   - The content does not "fly in separately" — it scales and repositions as a unit
   - This common fate during the transition tells the user "the detail view IS the card, expanded"

   **Decision procedure for animation synchronization:**
   1. Identify which elements form a group
   2. Assign identical `duration`, `easing`, and `delay` values to all elements in the group
   3. If using staggered entrance (elements appearing one by one), the stagger is the delay offset — but once visible, all elements must animate identically
   4. Test by recording the animation and stepping through frame-by-frame — any visual separation between group members indicates a timing mismatch

3. **Use staggered animation to imply sequence, not grouping.** Stagger (different delay values) creates an ordered sequence. This is the opposite of common fate — it makes elements feel sequential rather than grouped. Use stagger deliberately.

   **Worked example — list item entrance animations:**
   - Each item fades in with a 50ms stagger: item 1 at 0ms, item 2 at 50ms, item 3 at 100ms
   - During the entrance, the items feel sequential — "item 1 leads, the others follow"
   - After the entrance, all items are static and grouping reverts to proximity and similarity
   - The stagger communicates: "these items have an order" (list, timeline, priority)

   **When to stagger vs. synchronize:**
   - Synchronize: items that form a single unit (cards in a carousel, filters in a bar, tabs in a row)
   - Stagger: items that form a sequence (list entries, timeline events, step indicators)
   - Never stagger elements that should read as a simultaneous group — a staggered navigation menu makes each item feel independent rather than part of a unified nav

4. **Apply common fate to loading states.** Loading indicators that animate together signal "this is one loading process." Separate animations signal "these are independent processes."

   **Worked example — skeleton screen shimmer (Facebook/Meta pattern):**
   - Multiple placeholder rectangles (avatar, name, content lines) all share a single shimmer gradient animation
   - The shimmer moves left-to-right across ALL placeholders simultaneously — same direction, same speed
   - This common fate makes the entire skeleton feel like "one thing loading" rather than "six independent loading indicators"
   - Implementation: a single `linear-gradient` animation on a parent element, with children using `overflow: hidden` to clip the gradient to their shapes. One animation, shared by all.

   **Worked example — individual spinners (anti-pattern comparison):**
   - Dashboard with 4 widget cards, each showing its own independent spinner
   - Each spinner rotates at its own pace (started at different times, so they are out of phase)
   - Result: 4 separate loading states competing for attention, each demanding its own "wait" from the user
   - Fix: Use a single page-level skeleton shimmer, or synchronize all spinners to the same rotation phase

5. **Apply common fate to batch operations.** When a user selects multiple items and performs a batch action, the selected items must respond as a group.

   **Worked example — Gmail bulk email actions:**
   - User selects 5 emails using checkboxes
   - Clicks "Archive" — all 5 emails slide left simultaneously with the same duration (200ms) and easing
   - The synchronized exit animation confirms "these 5 items were a group, and they all moved to the archive"
   - If emails archived one by one (staggered by 100ms each), the user would perceive 5 separate archive actions, undermining the "batch" mental model

   **Worked example — Figma multi-select drag:**
   - User selects 3 design elements and drags them
   - All 3 elements move with the cursor at exactly the same delta (same x/y offset from the drag origin)
   - This rigid common fate makes 3 separate objects feel like a single compound object
   - If one element lagged behind (frame rate issue), it would "detach" perceptually, creating anxiety about whether the operation is working correctly

6. **Use broken common fate to signal state divergence.** When an element leaves a group (deselection, error, completion), breaking its common fate signals the departure.

   **Worked example — Trello card drag between lists:**
   - Cards in a list sit in a vertical column — static, grouped by proximity
   - When a card is dragged, it gains elevation (shadow increases) and moves with the cursor
   - The remaining cards animate to close the gap — they move together (common fate within the list)
   - The dragged card moves independently from all lists — its unique motion signals "I have left the group"
   - When dropped into a new list, the card's motion synchronizes with the target list's reflow — joining the new group through common fate

   **Worked example — multi-step form with validation errors:**
   - User submits a form. Valid fields transition smoothly to a confirmation state (fade to green check, 200ms)
   - Invalid fields shake horizontally (150ms, 4px amplitude) — a motion completely different from the valid fields
   - The divergent motion instantly communicates which fields need attention without reading any error messages
   - Valid fields moved together (common fate = "these are fine"). Invalid fields moved together but differently (common fate within the error group, divergent from the success group).

## Details

### Timing Parameters for Common Fate

Animation timing must be precise for common fate to work. Approximate values create subtle unease.

**Synchronized motion — required parameters:**

- **Duration:** Identical for all group members (e.g., all 200ms, not 200ms for some and 250ms for others)
- **Easing:** Identical curve (e.g., all `cubic-bezier(0.4, 0, 0.2, 1)`, not different curves per element)
- **Start time:** Must be within one frame (16.67ms at 60fps) of each other. Use `requestAnimationFrame` batching or CSS animation on a shared parent to guarantee synchronization.
- **Direction:** Same vector. If the group moves right, all members move right. One element moving right while another moves down breaks common fate instantly.

**Staggered sequence — acceptable parameters:**

- **Delay offset:** 30-80ms between items for smooth cascade. Under 30ms, stagger is imperceptible (items feel synchronized). Over 100ms, items feel disconnected (too much gap between entries).
- **Duration and easing:** Still identical for all items — only the delay differs.

### Common Fate in Micro-Interactions

Common fate operates at the micro-interaction level too:

**Hover effects on grouped elements:**

- A nav item with icon + text: on hover, both icon and text change color simultaneously (common fate = "these are one button")
- If only the text changes color on hover, the icon appears to be a separate element

**Toggle state changes:**

- A switch component: the thumb slides right AND the track changes color AND the label updates — all in 150ms with the same easing
- If the thumb moves in 150ms but the track color transitions in 300ms, they feel like separate components

**Button press feedback:**

- A button depresses: scale to 0.97, shadow reduces, background darkens — all simultaneously
- These three property changes, occurring in common fate, create a single "press" perception
- If the scale happens instantly but the shadow fades over 200ms, the button feels glitchy

### Common Fate and Performance

Synchronized animation requires consistent frame rates. If the browser drops frames on one element but not another, their common fate breaks.

**Implementation strategies for reliable synchronization:**

- **CSS approach:** Animate a parent container and let children inherit the transform. One animation = guaranteed synchronization.
- **JavaScript approach:** Use `requestAnimationFrame` and update all elements in the same frame callback. Never use separate `setTimeout` or `setInterval` calls for elements that should move together.
- **Web Animations API:** Use `element.animate()` with a shared timeline to ensure frame-level synchronization.
- **GPU compositing:** Use `transform` and `opacity` (GPU-composited properties) rather than `top`, `left`, `width`, `height` (layout-triggering). Layout recalculation can delay one element's render relative to another, breaking common fate at the pixel level.

### Anti-Patterns

1. **Desynchronized loading indicators.** Multiple spinners, progress bars, or shimmer effects running at different speeds or phases. Three cards each with their own spinner, started at different times, create three independent "loading" signals. The user must track three separate processes. Fix: use a single shared animation (one shimmer gradient, one skeleton, one progress indicator) or synchronize all indicators to the same phase using a shared CSS `animation-delay: 0s`.

2. **Inconsistent batch animation.** Selecting 5 items and archiving them, but each item exits with a slightly different duration or easing because the animation was applied per-element without shared timing. Fix: calculate all target positions first, then apply the animation to all elements in a single `requestAnimationFrame` tick with identical timing parameters.

3. **False common fate on unrelated elements.** Two unrelated UI elements that happen to animate at the same time with the same parameters. A sidebar closing while a toast appears — if both happen to use a 200ms slide animation, they feel related when they are not. Fix: use different timing for unrelated simultaneous animations. Give the sidebar 250ms and the toast 150ms. The timing difference breaks the false common fate.

4. **Breaking common fate during scroll.** Elements in a scrollable container that do not scroll together. A "sticky" header inside a scroll container that stutters (jumps between frames) appears to detach from the scrolling content, breaking the common fate of the scroll group. Fix: use CSS `position: sticky` (GPU-composited) rather than JavaScript-based scroll listeners that can lag by one or more frames.

### Real-World Examples

**Spotify Horizontal Carousel:**

- Cards scroll as a single unit — all cards share the same translateX animation per frame
- The scroll is momentum-based: after the user releases, all cards decelerate together using the same friction curve
- Snap points: when the scroll settles, all cards snap to alignment simultaneously — the snap does not move one card at a time
- This creates the perception of a continuous ribbon that the user is sliding through a viewport window

**Apple iOS Page Transitions:**

- When pushing a new view controller, the outgoing view translates left AND fades while the incoming view translates from right AND fades in
- Both views use the same 350ms duration with the same spring curve
- All elements within each view move with their parent — no element is independently animated during the transition
- This creates a single "page turn" perception rather than "a bunch of elements rearranging"

**Material Design Shared Element Transitions:**

- A list item transforms into a detail view: the image scales up, the title repositions, the card boundary expands
- All transforming elements use a single 300ms duration with `emphasized-decelerate` easing
- Non-transforming elements fade out (list) or fade in (detail) with the same 300ms timing
- The shared timing creates one fluid transformation rather than a disconnected disappear-and-appear

**Airbnb Map Pin Clustering:**

- When zooming out, nearby map pins animate toward each other and merge into a cluster pin
- The merging pins share a common trajectory (toward the cluster centroid) and timing
- This common fate signals "these individual listings are becoming a group"
- When zooming in, the cluster pin splits and pins animate outward — the outward common fate signals "this group is separating into individuals"
- The synchronized split creates a "bloom" effect that feels organic because all pins move simultaneously

**Linear's Batch Operations:**

- Select multiple issues, drag to a new status column
- All selected issues lift (shadow increase) simultaneously, move with the cursor as a unit, and drop into the target column together
- The remaining issues in the source column reflow to fill the gap — their upward movement shares common fate, signaling "we are the remaining group"
- The dropped issues settle into the target column with a shared bounce animation, signaling "we are now part of this group"

## Source

- Max Wertheimer, "Experimental Studies on Seeing Motion" (1912) — foundational motion perception and grouping
- Gunnar Johansson, "Visual Perception of Biological Motion" (1973) — common fate in motion perception
- Material Design motion documentation (m3.material.io/styles/motion)
- "Animation at Work" by Rachel Nabors — web animation principles and timing

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
