# Transitions & Timing

> Temporal design — enter/exit asymmetry, stagger patterns, easing functions (ease-out for enter, ease-in for exit), duration by element size, interruptibility

## When to Use

- Implementing CSS transitions or animations for component state changes (show/hide, expand/collapse, enable/disable)
- Deciding on enter and exit animation durations and easing for modals, drawers, tooltips, or dropdowns
- Building stagger animations for lists, grids, or sequential content reveals
- Designing interruptible animations where user input during a transition must be handled gracefully
- Calibrating animation timing to element size (small icon vs. full-screen overlay)
- Defining transition tokens for a design system that multiple teams will consume
- Debugging transitions that feel "off" — too slow, too fast, or mechanically wrong
- Any implementation requiring temporal coordination between two or more animated elements

## Instructions

1. **Apply enter/exit asymmetry as a default rule.** Enter transitions should be slightly longer than exit transitions. Rationale: entering elements bring new information the user needs to perceive and process, so they deserve more time. Exiting elements are being dismissed — the user has already decided they are done with that content, so the exit should be quick to confirm the dismissal. The concrete ratio is approximately 1.5:1 — if an enter is 300ms, the exit should be 200ms. Material Design 3 specifies this explicitly: a dialog enters at 400ms with `emphasized-decelerate` easing and exits at 200ms with `emphasized-accelerate` easing. A dropdown menu enters at 250ms and exits at 150ms. This asymmetry feels natural because it matches human attention patterns: we focus when something new appears, but we disengage quickly when something leaves.

2. **Use ease-out (deceleration) for entering elements and ease-in (acceleration) for exiting elements.** This maps to physical intuition: an object arriving decelerates as it reaches its destination (a ball rolling to a stop); an object departing accelerates away from its resting position (a ball being thrown). The CSS mapping:
   - **Enter:** `transition-timing-function: cubic-bezier(0.0, 0.0, 0.2, 1.0)` — starts fast, ends slow. Material Design's `emphasized-decelerate`.
   - **Exit:** `transition-timing-function: cubic-bezier(0.4, 0.0, 1, 1)` — starts slow, ends fast. Material Design's `emphasized-accelerate`.
   - **Move between positions:** `transition-timing-function: cubic-bezier(0.4, 0.0, 0.2, 1.0)` — accelerates then decelerates. Material Design's `standard` easing.
     Reversing this (ease-in for enter, ease-out for exit) creates an uncanny feeling: elements hesitate before appearing and linger after being dismissed, as if the interface is reluctant to respond.

3. **Scale duration to element size and travel distance.** Small elements that animate in place (toggle, checkbox, icon swap) need 100-150ms. Medium elements with moderate travel (card appearing, panel expanding, dropdown opening) need 200-350ms. Large elements with significant travel or surface area (modal entrance, page transition, drawer slide) need 300-500ms. The formula: `base_duration + (travel_distance_px * 0.8)ms`, clamped between 100ms and 500ms. For a dropdown menu appearing 200px below its trigger: `150 + (200 * 0.8) = 310ms`, rounded to the nearest token value of 300ms. Material Design scales by component category:
   - Small: switches, checkboxes, radio buttons — 100ms
   - Medium: cards, chips, text fields — 250ms
   - Large: sheets, dialogs, navigation — 300-400ms
   - Extra large: full-screen transitions — 400-500ms

4. **Design stagger patterns with intention, not uniform delay.** Stagger — the time offset between consecutive element animations — creates a ripple effect that guides the eye. But uniform stagger (every item delayed by the same amount) creates a linear progression that feels mechanical. Better stagger patterns:
   - **Decelerating stagger:** First items have shorter delays, later items have longer delays. Creates a "settling" effect. Delays: 0ms, 30ms, 70ms, 120ms, 180ms. The formula: `delay = index^1.5 * 15ms`.
   - **Attention-first stagger:** The most important element animates first with no delay. Secondary elements stagger after. If a dialog has a title, body, and actions, the title enters immediately (0ms delay), body enters at +60ms, and actions enter at +120ms.
   - **Spatial stagger:** Elements closest to the trigger point animate first. A dropdown opening from a button: items nearest the button appear first, items farthest appear last. This creates a "flow from source" effect that maintains spatial logic.
     Linear's issue list uses decelerating stagger — the first few items appear rapidly, then the pace slows, giving the eye time to catch up. Total stagger sequence stays under 400ms regardless of list length; after 8-10 items, remaining items appear simultaneously.

5. **Cap total stagger sequence duration.** A list of 50 items with 50ms stagger each would take 2,500ms to complete — unacceptable. Set a maximum total stagger duration of 300-400ms. For lists longer than ~8 items, apply stagger to the first 6-8 items, then reveal all remaining items simultaneously at the final stagger step. The user perceives the stagger effect from the first few items and their brain fills in the pattern for the rest. Implementation: `const delay = Math.min(index * staggerInterval, maxStaggerDelay)`.

6. **Make all transitions interruptible by default.** If a user triggers a new action while an animation is in progress, the animation must not block that action. Three interruptibility strategies:
   - **Jump to end:** The current animation instantly completes (jumps to final state), then the new animation begins. Simplest to implement. Use for short animations (under 200ms) where the jump is imperceptible.
   - **Reverse from current position:** The animation reverses direction from its current progress point. Use for toggle-like interactions (open/close a dropdown). CSS transitions do this automatically when the triggering property changes mid-transition — the browser calculates a reversed curve from the current interpolated value.
   - **Blend:** The current animation's target is updated and the motion curve recalculates from the current position to the new target. Spring animations do this naturally — you can change the target position of a spring mid-flight and it smoothly redirects. Framer Motion's `animate` prop handles this: updating the target value while a spring is active produces a smooth course correction without jarring stops or restarts.

   The anti-pattern: queuing animations. If a user rapidly toggles a dropdown 5 times, they should not watch 5 sequential open/close animations play out. The final state should resolve within one animation cycle of the last input.

7. **Use `will-change` and compositor-only properties for jank-free transitions.** Transitions that animate `transform` and `opacity` run on the compositor thread and never cause layout or paint jank. Transitions that animate `width`, `height`, `top`, `left`, `margin`, `padding`, `border-width`, or `box-shadow` trigger layout recalculation per frame and will drop frames on mid-range devices. Decision procedure:
   - **Position change:** Use `transform: translateX/Y()` not `left/top`
   - **Size change:** Use `transform: scale()` not `width/height` where possible. When actual dimensional change is needed (content reflow), animate `max-height` with `overflow: hidden` as a compromise.
   - **Visibility change:** Use `opacity` with `visibility: hidden` (at opacity 0) for proper accessibility — `opacity: 0` alone leaves the element focusable and clickable.
   - **Color change:** Animate `background-color` and `color` directly — these trigger paint but not layout, and paint is fast for small elements.
     Apply `will-change: transform, opacity` to elements that will animate, but remove it after the animation completes to free GPU memory. Do not apply `will-change` to more than 5-10 elements simultaneously.

8. **Define transition tokens as a system contract.** Transition tokens encode duration, easing, and delay as named values that all teams consume. A complete token system:

   ```css
   :root {
     /* Durations */
     --transition-instant: 0ms;
     --transition-fast: 100ms;
     --transition-normal: 200ms;
     --transition-moderate: 300ms;
     --transition-slow: 400ms;
     --transition-deliberate: 500ms;

     /* Easing */
     --ease-enter: cubic-bezier(0, 0, 0.2, 1);
     --ease-exit: cubic-bezier(0.4, 0, 1, 1);
     --ease-move: cubic-bezier(0.4, 0, 0.2, 1);
     --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

     /* Composed transitions */
     --transition-enter-normal: var(--transition-normal) var(--ease-enter);
     --transition-exit-fast: var(--transition-fast) var(--ease-exit);
     --transition-move-moderate: var(--transition-moderate) var(--ease-move);
   }
   ```

   Teams should never write raw `transition: 237ms cubic-bezier(0.68, -0.55, 0.27, 1.55)`. They should write `transition: opacity var(--transition-enter-normal), transform var(--transition-enter-normal)`. This ensures temporal coherence — all elements in the system share the same timing vocabulary.

## Details

### Enter/Exit Asymmetry: The Full Decision Table

| Component       | Enter Duration | Enter Easing          | Exit Duration | Exit Easing           | Notes                                |
| --------------- | -------------- | --------------------- | ------------- | --------------------- | ------------------------------------ |
| Tooltip         | 150ms          | ease-out              | 75ms          | ease-in               | Instant feel. Exit is half of enter. |
| Dropdown menu   | 250ms          | emphasized-decelerate | 150ms         | emphasized-accelerate | Items stagger 30ms on enter only.    |
| Modal dialog    | 400ms          | emphasized-decelerate | 200ms         | emphasized-accelerate | Scrim fades independently (300ms).   |
| Side drawer     | 350ms          | emphasized-decelerate | 250ms         | emphasized-accelerate | Slides from edge; scrim fades 300ms. |
| Bottom sheet    | 400ms          | spring (damping 0.85) | 200ms         | ease-in               | Spring overshoot on enter only.      |
| Toast/snackbar  | 250ms          | ease-out              | 200ms         | ease-in               | Enters from bottom, exits to bottom. |
| Page transition | 300ms          | standard              | 200ms         | accelerate            | Outgoing fades; incoming slides.     |
| Popover         | 200ms          | ease-out              | 100ms         | ease-in               | Scale from 95% to 100% on enter.     |

The pattern: exits are 50-60% of enter duration. Exits never have spring or overshoot easing. Exits never stagger — all exiting elements leave simultaneously for a clean, decisive dismissal.

### Stagger Mathematics

**Linear stagger:** `delay(i) = i * interval`. Interval of 50ms for 10 items = 500ms total. Simple but monotonous.

**Decelerating stagger:** `delay(i) = (i^exponent) * baseInterval`. With exponent 1.4 and base 20ms:

- Item 0: 0ms
- Item 1: 20ms
- Item 2: 53ms
- Item 3: 94ms
- Item 4: 141ms
- Item 5: 194ms

Total: 194ms for 6 items. The visual effect: a burst of items followed by a settling rhythm. This matches human perception — the first few items establish the pattern, then the brain predicts the rest.

**Capped stagger:** `delay(i) = Math.min(i * interval, maxDelay)`. With interval 40ms and max 280ms: items 0-7 stagger normally (0ms to 280ms), items 8+ all appear at 280ms. Prevents long lists from feeling like a progress bar.

**Reverse stagger for exits:** When dismissing a staggered list, reverse the order — last item disappears first, first item disappears last. This creates a "gathering" effect that mirrors the "spreading" effect of the entrance. Apple's Launchpad app grid uses reverse stagger on close: apps in the bottom-right corner disappear first, cascading up-left until the top-left app disappears last.

### Interruptibility in Practice

**CSS Transition Reversal.** When a CSS property changes mid-transition, the browser automatically reverses the transition from the current interpolated value. But the reversal timing is calculated based on how far the transition has progressed, not the original duration. If a 300ms ease-out transition is 200ms in (67% complete), and the property reverts, the browser calculates a reversed 200ms transition (proportional to remaining visual change). This produces natural-feeling interruptions without any JavaScript.

**Spring Interruption (Framer Motion/React Spring).** Spring animations are inherently interruptible. When the target value changes, the spring redirects from its current position and velocity toward the new target. This produces smooth direction changes without any visual discontinuity. The spring does not stop-and-restart; it curves toward the new target. This is why spring animations feel more responsive than duration-based animations in interactive contexts — they handle interruption gracefully by default.

**JavaScript-Driven Interruption.** For imperative animations (GSAP, anime.js, Web Animations API), implement a cancellation pattern: before starting a new animation, call `currentAnimation.cancel()` or `currentAnimation.finish()`, read the element's current computed style, and start the new animation from those computed values. Never animate from a hard-coded initial value when interrupting — always animate from the element's current visual state.

### Duration Perception and the Kriz Threshold

Research by Miller (1968) and Card, Moran, and Newell (1983) established three perceptual thresholds for interface response:

- **100ms:** The limit of "instantaneous." Feedback within 100ms feels like direct manipulation. Under this threshold, no transition is needed — instant state change is appropriate.
- **300ms:** The limit of "connected." The user still perceives the animation as a direct response to their action. Most UI transitions should complete within this window.
- **1000ms:** The limit of "flow." Beyond 1 second, the user's attention shifts and they begin thinking about whether the system is working. Animations longer than 1 second need progress indicators or are simply too long.

Practical implication: feedback animations (button press, toggle, hover) must complete within 100-200ms. Navigational transitions (page change, panel slide) must complete within 200-400ms. No user-initiated animation should exceed 500ms. The only acceptable animations above 500ms are system-initiated sequences (loading states, data refresh animations) where the duration matches actual processing time.

### Anti-Patterns

1. **Symmetric Enter/Exit.** Using identical duration and easing for enter and exit transitions. A modal that takes 400ms to appear and 400ms to disappear feels sluggish on close — the user has already mentally moved on, but the interface is still animating. The fix: cut exit duration to 50-60% of enter duration and use accelerate easing on exit. Material Design is explicit: "Exit transitions should be faster than enter transitions because the user no longer needs to focus on the leaving element."

2. **Infinite Stagger.** Applying stagger delay to every item in a long list without capping. A 100-item list with 50ms stagger takes 5 seconds to fully render. By item 30, the user has already scrolled past the animation and sees items popping in late, which looks like a loading bug rather than a design choice. Fix: cap stagger to the first 6-8 visible items (300-400ms total), and render remaining items instantly.

3. **Blocking Transitions.** Disabling pointer events or keyboard input during a transition, forcing the user to wait for the animation to complete. A drawer that takes 350ms to open and prevents all interaction until fully open adds 350ms of dead time to every navigation action. Across 20 navigation events per session, that is 7 seconds of staring at an animation. Fix: enable interaction on the destination surface as soon as it becomes visually accessible — typically at 40-60% of the transition progress. Linear's command palette is interactable before its entrance animation completes.

4. **Duration Guessing.** Choosing arbitrary duration values (137ms, 283ms, 421ms) based on "what feels right" without using a token scale. These magic numbers drift across components and create temporal incoherence — no two animations in the system share the same timing personality. Fix: define a duration scale (100, 150, 200, 250, 300, 400, 500ms) and snap every animation to the nearest step. Consistent durations create a unified temporal feel.

5. **Easing-Property Mismatch.** Using `ease-in-out` on enter/exit transitions where asymmetric easing is correct, or using `ease-out` on exit transitions where `ease-in` is correct. This creates subtle but perceptible wrongness — elements hesitate when they should depart swiftly, or decelerate when they should accelerate away. Fix: create a decision table (see above) and enforce it through token usage. If the token system only provides `--ease-enter` and `--ease-exit`, developers cannot accidentally use the wrong curve.

### Real-World Examples

**Material Design 3 Container Transform.** When a card expands into a full-screen detail view, MD3 uses a precisely choreographed transition: the card's border-radius animates from 12px to 0px over 300ms (`emphasized`), its bounds expand to the viewport using `transform: scale()` to avoid layout animation, and the card's content crossfades to the detail content during the middle 60% of the transition (fade out from 100ms-180ms, fade in from 180ms-280ms). The scrim behind the expanding card fades in over the first 150ms. The entire transition is interruptible — swiping down during the expansion reverses the animation from its current state using spring physics.

**Linear's Keyboard Navigation Transitions.** When navigating Linear's issue list with arrow keys, the selection highlight moves between items with a 120ms `ease-out` transition on `transform: translateY()`. The transition is fast enough to keep pace with rapid keyboard input — pressing the down arrow 5 times in quick succession moves the highlight smoothly through 5 items without queuing. This works because each new keystroke interrupts the current transition (CSS automatic reversal), and 120ms is short enough that the interruption is visually clean. The issue detail panel on the right updates with a 200ms crossfade, slightly trailing the selection change, which reinforces the cause-and-effect relationship.

**Vercel's Deploy Detail Cascade.** Vercel's deployment detail page uses a cascade entrance: the header (deployment URL, status badge) enters first (0ms delay, 200ms duration), the build log section enters second (80ms delay, 200ms duration), and the function/edge list enters third (140ms delay, 200ms duration). Total cascade: 340ms from first to last. Each section uses `ease-out` for its entrance and a slight upward slide (8px `translateY` to 0). The stagger creates a top-to-bottom reading flow that matches the natural scan direction. On exit (navigating away), all sections fade out simultaneously in 150ms with no stagger — the exit is decisive.

**Apple's Sheet Presentation Spring.** iOS's sheet presentation (the card that slides up from the bottom for modal content) uses a spring animation with `mass: 1, stiffness: 300, damping: 0.85`. The sheet slides up with one subtle overshoot (approximately 3% past its resting position) then settles. The dismissal is not a spring — it uses a `250ms ease-in` slide downward, matching the exit asymmetry principle. During the spring entrance, the sheet is already interactive — the user can tap buttons inside the sheet before the spring has fully settled. If the user grabs the sheet's drag handle during the entrance animation, the spring redirects to follow the user's finger, making the transition feel like a physical object being caught mid-flight.

## Source

- Material Design 3 — Motion and transitions documentation, https://m3.material.io/styles/motion
- CSS Specification — `transition` shorthand and `transition-timing-function`, https://www.w3.org/TR/css-transitions-1/
- Card, S., Moran, T., Newell, A. — _The Psychology of Human-Computer Interaction_ (1983), response time thresholds
- Miller, R. — "Response time in man-computer conversational transactions" (1968), perceptual limits
- Apple Human Interface Guidelines — Sheet presentation and spring animation parameters
- Web Animations API — https://www.w3.org/TR/web-animations-1/
- Framer Motion — Spring physics and interruptible animation documentation
- GSAP — Timeline sequencing and interruption patterns
- Nielsen, J. — "Response Times: The 3 Important Limits" (1993, updated from 1968 research)

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
