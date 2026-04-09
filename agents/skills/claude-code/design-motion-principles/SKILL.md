# Motion Principles

> Purposeful animation — Disney's 12 principles adapted for UI, easing curves, duration guidelines, choreography, motion as feedback vs decoration, reducing motion

## When to Use

- Designing any interface element that changes state, position, size, or visibility over time
- Evaluating whether an animation is purposeful (aids comprehension) or decorative (adds delight but no function)
- Building a motion system or defining animation tokens for a design system
- Choreographing multi-element transitions where several components animate simultaneously
- Implementing reduced-motion alternatives for accessibility compliance
- Reviewing animation performance and deciding between CSS transitions, CSS animations, and JavaScript-driven motion
- Creating onboarding flows, page transitions, or loading sequences that use coordinated motion
- Any decision about how something should move, how fast, and with what character

## Instructions

1. **Apply the "purpose test" before adding any animation.** Every animation must serve at least one of four purposes: (a) orient — show the user where they are in space or in a flow, (b) focus — direct attention to a change or new element, (c) express — reinforce brand personality through motion character, or (d) connect — show causal relationships between actions and outcomes. If an animation serves none of these, it is visual noise. Material Design 3's motion guidelines formalize this: transitions must "help users understand and navigate an app by showing how elements are related to each other." A sidebar sliding in from the left serves orient (spatial origin). A notification badge pulsing serves focus. A playful logo bounce serves express. A button morphing into a loading spinner serves connect.

2. **Adapt Disney's 12 principles for UI motion selectively.** Disney's 1981 principles were designed for character animation, not interfaces. Six translate directly to UI. The remaining six are character-specific and should be ignored:

   **Use these six:**
   - **Squash and stretch** — elements compress on impact and stretch on departure. A modal landing on screen can scale from 102% to 100% on arrival (subtle squash). Material Design's FAB press applies 95% scale (squash) on press.
   - **Anticipation** — a brief reverse motion before the main action. A card about to dismiss shifts 4-8px in the opposite direction before swiping away. Apple's delete animation retracts an item slightly before removing it.
   - **Slow in and slow out (easing)** — natural motion accelerates and decelerates. This maps directly to CSS easing functions. Linear motion (`linear`) looks robotic. Always use curved easing.
   - **Follow through and overlapping action** — secondary elements lag behind the primary. When a panel slides open, its content fades in 50-100ms after the panel reaches its final position. Linear's page transitions use this: the container slides in, then text elements fade up with a 40ms stagger.
   - **Arcs** — natural motion follows curved paths, not straight lines. An element moving from a FAB position (bottom-right) to a dialog position (center) should follow a slight arc, not a straight diagonal. Material Design's "shared axis" transition uses arc paths for element relocation.
   - **Staging** — present one idea at a time. Do not animate five elements simultaneously. Stagger entrances so the user can process each element: 40-80ms delay between items in a list, 100-150ms delay between major sections.

   **Skip these six (character animation only):** Timing (subsumed by duration guidelines), secondary action (subsumed by overlapping action in UI), straight ahead / pose to pose (animation production methods), exaggeration (risks looking cartoonish in UI), solid drawing (3D modeling concept), appeal (subjective character design).

3. **Define easing curves as system tokens.** Every animation in a system should use one of 3-5 named easing curves, never arbitrary `cubic-bezier` values. A production-ready easing system:
   - **Standard** (`cubic-bezier(0.2, 0.0, 0, 1.0)`) — the default for most transitions. Starts fast, decelerates smoothly. Used for elements moving between resting positions.
   - **Emphasized** (`cubic-bezier(0.2, 0.0, 0, 1.0)` for decelerate, `cubic-bezier(0.3, 0.0, 0.8, 0.15)` for accelerate) — for focal transitions that demand attention. Material Design 3 uses emphasized easing for hero transitions and container transforms.
   - **Decelerate-only** (`cubic-bezier(0.0, 0.0, 0, 1.0)`) — for elements entering the screen. The element starts at full velocity and slows to a stop, matching the mental model of something arriving.
   - **Accelerate-only** (`cubic-bezier(0.3, 0.0, 1, 1)`) — for elements exiting the screen. The element starts slow and accelerates away, matching departure.
   - **Spring** (`spring(1, 100, 10, 0)` in frameworks that support it, or approximated as `cubic-bezier(0.34, 1.56, 0.64, 1)`) — for playful, physical interactions. Apple uses spring animations extensively: damping ratio 0.7-0.85, stiffness 200-400. The iOS keyboard uses a spring with damping 0.85 for its slide-up entrance.

4. **Set duration by element size and travel distance, not by feel.** Small elements (icons, badges, checkmarks) need 100-150ms. Medium elements (cards, buttons, chips) need 200-300ms. Large elements (modals, drawers, page transitions) need 300-500ms. Full-screen transitions need 400-700ms. The rule: larger elements need more time because the eye tracks more visual change. Material Design 3's duration tokens:
   - `duration-short1`: 50ms (micro-feedback: ripples, state layers)
   - `duration-short2`: 100ms (small components: switch, checkbox)
   - `duration-short3`: 150ms (selection controls, small transforms)
   - `duration-short4`: 200ms (entering small components)
   - `duration-medium1`: 250ms (standard component transitions)
   - `duration-medium2`: 300ms (shared axis transitions)
   - `duration-medium3`: 350ms (complex shape changes)
   - `duration-medium4`: 400ms (full-screen transitions)
   - `duration-long1` through `duration-long4`: 450-700ms (elaborate choreography)
     Never exceed 700ms for any single animation. The user's perception of "instantaneous" ends at ~100ms and "connected to my action" ends at ~300ms.

5. **Choreograph multi-element transitions with stagger and sequencing.** When multiple elements animate simultaneously, the result is chaos unless choreographed. Three choreography patterns:
   - **Stagger:** Elements animate with identical motion but offset start times. List items entering: 40-80ms delay between each item. Linear uses 40ms stagger for issue lists — fast enough to feel fluid, slow enough that each item is individually perceivable.
   - **Cascade:** Elements animate in dependency order — parent first, then children. A dialog enters (300ms), then its title fades in (200ms, 50ms delay), then body text (200ms, 100ms delay), then action buttons (150ms, 150ms delay). Vercel's deployment detail page uses this cascade pattern.
   - **Shared motion:** Elements that are conceptually related animate in lockstep. A card expanding into a detail view — the card surface, the title, and the image all animate together on the same timeline with the same easing. Material Design's "container transform" is the canonical shared motion pattern.

6. **Distinguish feedback motion from narrative motion.** Feedback motion is reactive — it responds to a user action (button press, toggle switch, form validation). Feedback must be fast (100-200ms), subtle, and never block the user from continuing. Narrative motion is proactive — it tells a story (onboarding sequence, loading animation, feature tour). Narrative motion can be longer (300-700ms per step), more elaborate, and is allowed to command full attention because it occurs at natural pause points. The error: using narrative-length motion for feedback actions, making the interface feel sluggish. A button press animation at 500ms is narrative motion misapplied to a feedback context.

7. **Implement reduced motion as a first-class design concern, not an afterthought.** The `prefers-reduced-motion: reduce` media query indicates a user who experiences discomfort from animation. The implementation hierarchy:
   - **Eliminate** all decorative animations (parallax, background motion, hover bounces)
   - **Replace** transitions with instant state changes (crossfade in 1ms instead of slide over 300ms)
   - **Preserve** essential state indicators (loading spinners become pulsing dots, progress bars remain but do not animate fill)
   - **Never** remove information — if an animation communicates state (green checkmark drawing in), the end state must still appear (green checkmark shown instantly)

   Apple's reduced-motion implementation is the gold standard: when enabled on iOS, the app-open zoom animation becomes a crossfade, the parallax home screen becomes static, and the swipe-to-go-back gesture still works but without the sliding animation — the page just appears.

8. **Budget total motion per screen.** No more than 3 simultaneous animations visible to the user at any moment. Beyond 3, the eye cannot track individual movements and the experience feels chaotic. This budget means: if a page has a loading spinner, a skeleton screen pulse, and a notification badge animation all visible, adding a fourth animation (e.g., an animated gradient) exceeds the budget. Cut the least important one. Spotify's Now Playing screen respects this: album art color gradient (1), progress bar (2), and the waveform visualizer (3) — exactly three concurrent motions, each in a distinct screen region.

## Details

### Easing Function Mathematics

An easing function maps input time `t` (0 to 1) to output progress `p` (0 to 1). A `cubic-bezier(x1, y1, x2, y2)` defines a cubic Bezier curve with fixed endpoints at (0,0) and (1,1) and two control points at (x1,y1) and (x2,y2).

**Linear** (`cubic-bezier(0,0,1,1)`): `p = t`. Constant velocity. Feels mechanical. Use only for progress bars and video playback scrubbing where constant rate is the correct metaphor.

**Ease-out** (`cubic-bezier(0, 0, 0.2, 1)`): Fast start, gradual deceleration. The element arrives with energy and settles. This is the most natural entry animation because it mimics an object being tossed — fast initial velocity, friction slows it. Material Design's `standard-decelerate` curve.

**Ease-in** (`cubic-bezier(0.4, 0, 1, 1)`): Slow start, accelerating exit. The element gathers speed as it leaves. Less common in UI because exits are usually fast. Used for dismissal animations where the element accelerates off-screen.

**Ease-in-out** (`cubic-bezier(0.4, 0, 0.2, 1)`): Accelerates then decelerates. Used for elements moving between two on-screen positions (e.g., a tab indicator sliding from one tab to another). Material Design's `standard` curve.

**Spring physics** approximate overshoot — the element passes its target position, then oscillates back. Characterized by `damping` (how quickly oscillation stops; 0.7-0.85 for UI) and `stiffness` (how strong the pull to target; 200-400 for UI). Apple's iOS sheet presentation uses spring with damping 0.82, creating a single subtle overshoot that feels physically grounded without being bouncy. Frameworks: Framer Motion's `type: "spring"`, React Native's `Animated.spring()`, CSS `linear()` polyfill.

### Motion Choreography Patterns

**Shared-Axis Transition (Material Design 3).** When navigating along a spatial axis (list to detail, tab to tab), both the outgoing and incoming elements animate along that shared axis. Example: tapping a list item — the list fades and slides left (exit), while the detail view fades and slides in from the right (enter). Both use the x-axis as the shared axis. Duration: 300ms outgoing, 300ms incoming, with 35ms overlap. This creates spatial continuity — the user perceives a coherent space being navigated rather than disconnected pages being swapped.

**Container Transform.** An element transforms into another element, maintaining visual continuity. The source element (e.g., a card) smoothly changes shape, size, and position to become the destination element (e.g., a full-screen detail view). The card's corner radius animates from 12px to 0px, its bounds expand to full screen, and its content crossfades from card layout to detail layout. Duration: 300-450ms. Easing: `emphasized`. Material Design 3 uses this for FAB-to-dialog and card-to-detail transitions.

**Fade Through.** Two elements that are not spatially related transition via a sequential fade: the outgoing element fades out (90ms, `accelerate` easing), then the incoming element fades in (210ms, `decelerate` easing). Total: 300ms. A brief gap at the crossover point (both elements at low opacity) prevents the layered "double vision" effect of a simultaneous crossfade. Material Design uses fade through for bottom navigation tab switches.

### Anti-Patterns

1. **The Loading Screen Movie.** A 3-5 second elaborate animation sequence that plays every time the app loads or navigates between pages. Users see this animation hundreds of times. What felt impressive on first encounter becomes an infuriating delay by the tenth. The fix: loading animations should last no longer than the actual load time, and even then, they should be skeletal (skeleton screens, subtle pulsing) rather than narrative (logo animations, mascot dances). If your load time is 200ms, showing a 2-second loading animation makes the app feel 10x slower than it is.

2. **Motion Sickness Roulette.** Using large-scale zoom, rotation, or parallax animations without reduced-motion alternatives. Approximately 35% of adults over 40 have vestibular sensitivity. A full-screen zoom transition or a rotating carousel can trigger nausea, dizziness, or disorientation. The fix: every animation that covers more than 50% of the viewport must have a `prefers-reduced-motion` alternative. This is not optional polish — it is an accessibility requirement equivalent to alt text for images.

3. **Easing Anarchy.** Using different easing curves on every element — one card uses `ease-in-out`, another uses `ease-out`, the drawer uses a custom `cubic-bezier(0.68, -0.55, 0.27, 1.55)` with overshoot, and the tooltip uses `linear`. The interface feels like it was assembled from different physics engines. Fix: define 3-5 easing tokens and use them consistently. Every element in the system should share the same motion vocabulary.

4. **Simultaneous Blast.** Animating all elements on a page at the same time with the same duration, creating a visual explosion where everything moves at once and nothing is individually trackable. The user's eye has no focal point. Fix: stagger entries by 40-80ms between elements. Lead with the most important element (the primary content), then reveal secondary elements (navigation, sidebar, auxiliary content) after the primary has settled.

5. **The Un-interruptible Animation.** An animation that plays to completion regardless of user input. The user clicks a button, a 500ms animation starts, and the user cannot interact with anything until it finishes. This violates the fundamental principle that the interface should always respond to the user within 100ms. Fix: all animations should be interruptible — if the user takes a new action during an animation, the animation should be cancelled or rapidly completed (jump to end state in 50ms) so the new action can begin immediately.

### Motion Budget Framework

A motion budget prevents animation overload by quantifying the total animation complexity allowed per screen. The budget has three dimensions:

**Concurrent animation count.** Maximum 3 simultaneous animations visible to the user at any moment. Track this by auditing each screen state: if a loading spinner, a skeleton pulse, and a background gradient animation are all visible, the budget is spent. A notification entrance animation would need to wait for one of the three to complete. Spotify's Now Playing screen exemplifies exact budget adherence: album art gradient (1), progress bar (2), waveform (3) — no fourth animation.

**Cumulative animation duration per navigation action.** The total animation time between a user's action (click, tap, swipe) and the system reaching a fully settled state should not exceed 600ms. If a page transition takes 300ms and a content stagger takes 300ms, the budget is spent. Adding a third animation (e.g., sidebar slide) would push past the 600ms threshold and make the interface feel slow. Linear keeps total transition duration under 400ms by overlapping exit and entrance animations.

**Animation surface area.** The percentage of the viewport undergoing animation at any moment. Full-screen transitions (100% surface area) should be reserved for major navigation events (page changes, modal opens). Partial-screen animations (cards, panels, lists) should affect less than 40% of the viewport simultaneously. Micro-interactions (buttons, toggles, icons) should affect less than 5%. When more than 40% of the viewport animates simultaneously, users report the interface feeling "chaotic" regardless of animation quality.

### Motion Decision Procedure

Before adding any animation, answer these questions in order:

1. **Does this animation exist in the motion token system?** If yes, use the existing token (duration, easing, property). If no, check if an existing token can serve the purpose. Only create a new token if no existing one applies — and update the token documentation.
2. **What purpose does this animation serve?** Map it to one of the four purposes (orient, focus, express, connect). If none apply, the animation is decorative — skip it unless you have explicit budget.
3. **What is the duration?** Look up the element size in the duration scale. Do not use custom durations.
4. **What is the easing?** Enter = decelerate. Exit = accelerate. Move = standard. Playful = spring. Do not use custom curves.
5. **Does this exceed the concurrent animation budget?** Check what else will be animating when this fires. If the budget is spent, queue or cut.
6. **What is the reduced-motion alternative?** Define it now, not later. If the animation is functional, provide a simplified version. If decorative, provide instant state change.

### Real-World Examples

**Apple's Spring Animation System.** Apple uses spring physics as the foundation for nearly all iOS animations. The home screen app icon press uses `stiffness: 400, damping: 0.72` — a quick, slightly bouncy compression. The sheet presentation (swipe up to show a modal card) uses `stiffness: 300, damping: 0.85` — a slower, more dampened slide with exactly one subtle overshoot. The key insight: spring animations feel natural because they are governed by physics equations rather than arbitrary curves. Two springs with different stiffness/damping values still feel like they belong to the same physical world because they share the same underlying motion model.

**Material Design 3 Motion System.** MD3 defines three categories: transitions (between screens), component animations (within a screen), and state-layer animations (hover, press, focus). Each category has specific duration ranges and easing tokens. Transitions use 300-700ms with `emphasized` easing. Component animations use 100-300ms with `standard` easing. State-layer animations use 50-150ms with `standard` easing. This three-tier system ensures that no component animation is ever mistaken for a transition (the duration gap prevents it) and that state-layer feedback never feels sluggish (the 150ms ceiling ensures responsiveness).

**Linear's Page Transition Choreography.** Linear's web app transitions between views (inbox, project board, settings) using a choreographed sequence: outgoing content fades out with a slight upward movement (150ms, `accelerate`), then incoming content fades in with a slight downward-to-resting movement (200ms, `decelerate`) with a 40ms stagger between the header, main content, and sidebar sections. The total transition feels instantaneous (~250ms perceived) despite involving 6+ individual animations. The secret: overlapping the exit and entrance by 50ms so there is no "dead" gap where the screen is empty.

**Spotify's Contextual Motion Language.** Spotify uses motion to reinforce its audio-visual brand. Album art transitions use a crossfade with scale (the new album grows from 95% to 100% while fading in, the old album shrinks to 95% while fading out — 300ms, `ease-out`). The Now Playing bar slides up from the bottom with a spring animation when first invoked, then snaps between minimized and expanded states. List scrolling uses inertia-based deceleration that matches iOS physics exactly — Spotify does not override the platform scroll behavior, ensuring familiarity. The waveform visualizer uses a custom animation that synchronizes with audio amplitude, creating a motion that is impossible to separate from the content it represents.

## Source

- Thomas, F. and Johnston, O. — _The Illusion of Life: Disney Animation_ (1981), the 12 principles
- Material Design 3 — Motion documentation, https://m3.material.io/styles/motion
- Apple Human Interface Guidelines — Motion and spring animations
- CSS Specification — `transition-timing-function`, https://www.w3.org/TR/css-transitions-1/#transition-timing-function-property
- Google Web Fundamentals — "Animations and Performance" (compositor-only properties)
- W3C — `prefers-reduced-motion` media query, https://www.w3.org/TR/mediaqueries-5/#prefers-reduced-motion
- Framer Motion — Spring animation configuration documentation
- Val Head — _Designing Interface Animation_ (2016), motion design principles for UI
- Issara Willenskomer — "Creating Usability with Motion" (UX in Motion Manifesto)

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
