# Micro-Interactions

> Small moments that delight — trigger, rules, feedback, loops/modes (Dan Saffer's framework), when micro-interactions aid usability vs decoration

## When to Use

- Adding interactive feedback to buttons, toggles, switches, or form controls
- Designing pull-to-refresh, swipe-to-dismiss, long-press, or gesture-driven interactions
- Evaluating whether an animation serves usability or is purely decorative
- Building loading transitions, success confirmations, or error acknowledgments
- Creating onboarding moments that teach through interaction rather than text
- Reviewing motion design for performance impact and accessibility compliance
- Designing system status indicators (typing indicators, sync status, connection state)
- Any moment where the interface responds to a single user action with a contained, purposeful animation

## Instructions

1. **Decompose every micro-interaction into Dan Saffer's four-part structure.** Every micro-interaction has: (a) a Trigger — what initiates it (user action or system event), (b) Rules — what happens and in what order, (c) Feedback — what the user perceives, and (d) Loops and Modes — whether the interaction repeats, changes over time, or has alternate behaviors. If you cannot articulate all four parts, the interaction is underdesigned. Saffer's framework from _Microinteractions_ (2013) remains the definitive structural model.

2. **Start with the trigger type.** Triggers are either user-initiated (tap, click, hover, scroll, gesture, voice) or system-initiated (notification, timer, state change, incoming data). User-initiated triggers must have zero perceptible delay — the feedback must begin within one animation frame (16ms at 60fps). System-initiated triggers must be non-intrusive: they should not interrupt the user's current task. Slack's typing indicator is system-initiated ("Someone is typing...") and appears in a dedicated, predictable location below the message input — it never interrupts reading flow.

3. **Define rules that are simple and deterministic.** Rules govern the behavior between trigger and feedback. Good rules have no branching visible to the user. The iOS toggle switch has one rule: "When tapped, slide the knob to the opposite position and change the background color." The user never needs to think about conditional logic. If your micro-interaction requires the user to understand conditional rules ("If X, then Y, but if Z, then W"), it is too complex — split it into separate interactions.

4. **Design feedback across three sensory channels.** The strongest micro-interactions use multiple channels simultaneously: visual (color change, position shift, scale transform), auditory (click sound, chime), and haptic (vibration, force feedback). Apple's iOS toggle combines all three: the knob slides (visual), a subtle click plays (auditory on supported devices), and a light haptic tap fires (haptic via Taptic Engine). For web interfaces where haptic and audio are limited, visual feedback must carry the full communicative load — use at least two visual properties (e.g., color + position, scale + opacity).

5. **Calibrate duration to interaction weight.** Lightweight interactions (toggle, checkbox, hover) need 100-200ms durations. Medium interactions (panel expand, drawer open, card flip) need 200-350ms. Heavy interactions (page transition, modal entrance, complex state change) need 300-500ms. Anything over 500ms feels sluggish. Anything under 100ms feels instantaneous and may not register as a transition at all. Material Design specifies exact values: small components use 100ms, medium surfaces use 250ms, full-screen transitions use 300-375ms.

6. **Use easing curves that match physical intuition.** Linear easing feels robotic. Standard easing (`cubic-bezier(0.4, 0.0, 0.2, 1)` in Material Design) mimics natural deceleration — objects accelerate quickly then ease to a stop, matching how physical objects behave under friction. Enter animations should use deceleration easing (fast start, slow end) because the element is "arriving." Exit animations should use acceleration easing (slow start, fast end) because the element is "departing." Material Design's easing tokens: `emphasized` for focal elements, `standard` for most transitions, `emphasized-decelerate` for entries, `emphasized-accelerate` for exits.

7. **Apply the usability test: remove the micro-interaction and check if the UI still works.** If removing the animation makes the interface harder to use (the user cannot tell what changed, where an element went, or what state they are in), the micro-interaction is functional. If removing it changes nothing about usability (the user can still complete their task identically), the micro-interaction is decorative. Functional micro-interactions are essential. Decorative micro-interactions are budget-dependent — they add delight but are the first thing to cut when performance is constrained.

8. **Design for loops and long-term exposure.** A micro-interaction that delights on first encounter may irritate on the hundredth. Saffer's "loops" concept addresses this: consider whether the interaction should attenuate over time (reduce in intensity after repeated exposure), remain constant (critical status indicators must never fade), or escalate (an unacknowledged notification that becomes more prominent). Slack's unread badge is constant — it must be reliable. A celebratory confetti animation on task completion should attenuate — show it the first five times, then replace it with a subtle checkmark.

## Details

### The Four-Part Framework in Depth

**Triggers.** The best triggers are discoverable through existing affordances. A swipeable card should look swipeable (slight shadow suggesting depth, visible edge of the next card). Instagram's pull-to-refresh uses a trigger that aligns with the existing scroll gesture — the user does not need to learn a new action, they just scroll past the top. Hidden triggers (long press, force touch, multi-finger gestures) are power-user features and must never be the only way to access a function. Every hidden trigger must have a visible alternative.

**Rules.** Rules should be expressible in a single sentence: "When the user clicks the heart icon, it scales to 120%, changes to red fill, and a particle burst emanates from center." Twitter/X's like animation follows this exactly. The particle burst is a single-sentence addition to the basic toggle rule. Rules become problematic when they depend on external state the user cannot see: "If the server has already processed this, do X; otherwise do Y" creates unpredictable behavior. Keep rules local to what the user can observe.

**Feedback.** Feedback must be proportional to the action's significance. A trivial action (hovering over a menu item) deserves trivial feedback (subtle background color shift, 100ms). A significant action (submitting a form, deleting data) deserves significant feedback (confirmation animation, state change, 300-500ms). GitHub's star animation is proportional: a small bounce and fill change for a low-commitment action. Stripe's successful payment confirmation is proportionally larger: a checkmark draw animation, a green background pulse, and a summary slide-in.

**Loops and Modes.** Loops govern what happens when the trigger fires repeatedly or when conditions change. A "like" button has a loop: tap once to like (fill), tap again to unlike (unfill). The loop must feel equally responsive in both directions — if the "like" animation is 300ms but the "unlike" is instant, the asymmetry feels broken. Modes are alternate behaviors under different conditions: a download button that shows progress while downloading, then changes to an "Open" button when complete. The mode change must be visually clear — GitHub's "Clone" button changes to "Open in Desktop" contextually, with a complete icon and label swap.

### Micro-Interaction Patterns Catalog

**Toggle/Switch.** Trigger: tap/click. Rules: slide knob, swap color, update state. Feedback: knob position + color change + haptic. Duration: 150-200ms. Easing: standard. Apple's iOS toggle is the benchmark: 200ms duration, the knob has a subtle scale bounce at the endpoints (102% then back to 100%), the track color transitions through an intermediate state. Material Design's switch adds a ripple effect at the touch point.

**Button Press.** Trigger: pointerdown. Rules: scale down slightly (97-98%), increase shadow depth on release. Feedback: scale + shadow + color. Duration: 100ms press, 200ms release. The press-and-release rhythm must feel physical — like pushing a real button. Material Design elevates the button by 2dp on press (shadow increases from `elevation-1` to `elevation-3`). Stripe scales buttons to 98% with a 100ms `ease-out`, then returns to 100% with a 150ms `ease-in-out` on release.

**Pull-to-Refresh.** Trigger: overscroll gesture. Rules: resistance curve increases with pull distance, icon rotates proportionally, threshold triggers refresh. Feedback: rubber-band resistance + rotating icon + haptic at threshold. The critical detail is the resistance curve: initial pull should move 1:1 with the finger, then progressively resist (logarithmic curve) past the trigger threshold. Apple's implementation adds a haptic tap at the exact moment the threshold is crossed — the user feels confirmation before releasing.

**Swipe-to-Dismiss/Delete.** Trigger: horizontal swipe. Rules: element follows finger with friction, reveal action underneath, threshold triggers action or snap-back. Feedback: position tracking + background reveal + color change at threshold. The snap-back animation when the user does not reach the threshold must be fast (150ms) and springy — it communicates "you didn't go far enough" through physics. Apple Mail's swipe-to-delete reveals a red "Trash" action; the threshold is approximately 60% of the cell width.

**Typing Indicator.** Trigger: system event (remote user starts typing). Rules: show indicator after 500ms of continuous typing, hide 3 seconds after last keystroke. Feedback: animated dots (the classic "..." bounce) or text ("Alex is typing..."). The 500ms delay before showing prevents flicker from brief typing bursts. The 3-second hide timeout prevents the indicator from staying visible after the remote user paused. Slack and iMessage both use this exact timing.

**Form Validation Feedback.** Trigger: field blur (user leaves field). Rules: validate field value against constraints, determine valid/invalid. Feedback for valid: green checkmark fades in at field's right edge (150ms, ease-in), field border optionally shifts to green. Feedback for invalid: red border color transition (200ms), error icon appears, error message slides down below the field (200ms, ease-out). The error message animation must not cause layout shift in the form below — reserve space or use absolute positioning. Stripe's card number field validates on blur with a smooth border color transition and a specific error message that slides into a reserved space below the field.

**Drag-and-Drop Reorder.** Trigger: pointerdown + hold (150ms delay to distinguish from click). Rules: element lifts with elevation increase (shadow deepens), follows pointer position with 1:1 tracking, other items reflow to indicate drop position. Feedback: elevation change (shadow from 2dp to 8dp), scale increase to 103%, subtle rotation (1-2 degrees) to break grid alignment and feel "picked up," drop target highlight (background color pulse on valid targets). The 150ms hold delay prevents accidental drags from fast clicks. Linear's issue list uses this pattern — dragging an issue between status columns feels physical because of the lift, scale, and shadow cues.

### Performance Budgets for Micro-Interactions

Every micro-interaction has a performance cost. The budget constraints:

- **Frame budget:** 16.67ms per frame at 60fps. All animation calculations (transform, opacity, color) must complete within this window. Avoid animating `width`, `height`, `top`, `left`, or `margin` — these trigger layout recalculation. Instead animate `transform` (translateX/Y, scale, rotate) and `opacity`, which are compositor-only properties and run on the GPU.
- **Paint budget:** Avoid `box-shadow` animations and `border-radius` animations on large elements — these trigger paint. Use `filter: drop-shadow()` with hardware acceleration or pre-render shadow states as separate layers.
- **JavaScript budget:** `requestAnimationFrame` for imperative animations. Never use `setInterval` or `setTimeout` for frame-by-frame animation — they do not synchronize with the display refresh and cause jank. CSS transitions and Web Animations API are preferred over JavaScript-driven animations for simple transforms.
- **Total animation weight:** A page should not run more than 3 simultaneous animations. Beyond 3, the compositor thread contends for GPU resources and frame drops become visible. If you need staggered animations (e.g., a list appearing item-by-item), use CSS `animation-delay` with a single animation definition rather than spawning independent animation instances.

### Anti-Patterns

1. **Gratuitous Bounce.** Adding spring/bounce easing to every element — buttons bounce, cards bounce, modals bounce. Bouncy animations signal playfulness, which is appropriate for a children's app but undermines credibility in finance, healthcare, or enterprise tools. Reserve spring physics for interactions where the physical metaphor adds meaning (pull-to-refresh, swipe snap-back). Use standard easing for everything else.

2. **Animation Hostage.** Forcing users to wait for an animation to complete before they can interact. A modal that takes 500ms to open and disables all input during the animation holds the user hostage for half a second per interaction. Solution: allow input during entrance animations. The user should be able to click a button inside a modal before the modal's entrance animation completes. Linear's command palette is interactive before its slide-in animation finishes — the user can start typing immediately.

3. **Inconsistent Duration Scale.** Using random durations (137ms here, 420ms there, 800ms elsewhere) with no systematic relationship. This creates a UI that feels chaotic — every element has its own temporal personality. Fix: define a duration scale (e.g., 100ms, 200ms, 300ms, 500ms) and map every animation to the nearest scale value. Material Design uses exactly this: `duration.short1` (50ms) through `duration.long4` (700ms) in defined steps.

4. **Hover-Only Feedback.** Relying solely on hover states for interactive feedback, which excludes touch devices entirely (no hover on mobile) and keyboard users. Every hover-based micro-interaction must have a focus equivalent and a touch equivalent. If a button changes color on hover, it must also change color on `:focus-visible` and on `:active` for touch.

5. **Decorative Overload.** Adding micro-interactions to every possible element — icon rotations, label fades, border pulses, background gradients — until the interface feels like a fireworks display. Each micro-interaction competes for the user's attention. More than 2-3 simultaneous animations on screen create cognitive overload. Fix: apply the usability test from Instruction 7 to every animation. If it is decorative, cut it unless you have explicit performance and attention budget for it.

### Real-World Examples

**Apple iOS Pull-to-Refresh.** Trigger: overscroll past top of scroll view. Rules: spinner appears, scales from 0 to 1 proportional to pull distance, begins rotating at threshold. Feedback: visual (spinner rotation + content displacement) + haptic (single tap at threshold). Loop: repeated pulls always behave identically — this is a constant loop, no attenuation. The interaction is so precisely tuned that users can feel the threshold without looking, relying on the haptic alone.

**Material Design FAB Transformation.** The Floating Action Button transforms from a circular icon into an expanded surface (bottom sheet, full-screen dialog, or speed dial). Trigger: tap. Rules: circle expands along a deceleration curve, icon morphs into content, background floods to fill the target shape. Feedback: continuous shape transformation over 250-300ms using `emphasized-decelerate` easing. This micro-interaction communicates that the new surface originated from the FAB — spatial continuity that prevents the "where did this come from?" disorientation of a popup appearing from nowhere.

**GitHub Star/Unstar.** Trigger: click on star icon. Rules: toggle filled/unfilled state, increment/decrement counter. Feedback: icon fills with yellow, counter updates, subtle scale bounce (110% then settle to 100%) over 200ms. The bounce is small enough to feel responsive without being playful. The unstar animation is equally weighted — same duration, same scale curve in reverse — so the interaction feels reversible and low-commitment.

**Slack Typing Indicator.** Trigger: system event (remote keystroke received). Rules: show after 500ms continuous typing, hide 3s after last keystroke, display up to 3 names then "several people are typing." Feedback: animated ellipsis dots that bounce in sequence (each dot delayed 150ms from the previous) at the bottom of the message area. Loop: the animation loops continuously while active but is positioned to never obscure message content. The sequential dot bounce conveys ongoing activity without being distracting.

**Vercel Deployment Status Transition.** Vercel's deployment card transitions between states (Queued, Building, Deploying, Ready, Error) with micro-interactions that communicate progress. The status dot changes color through a smooth hue transition (gray to yellow to blue to green) rather than an instant swap. The dot pulses with a subtle scale animation (100% to 110% to 100% over 1.2 seconds) while the deployment is in progress — the pulse communicates "working" without requiring the user to read the status text. On completion, the pulse stops and a checkmark draws in with a 300ms stroke animation. The entire transition sequence uses a consistent easing curve (`ease-in-out`) across all stages, creating temporal coherence.

### Accessibility and Reduced Motion

Micro-interactions must respect the `prefers-reduced-motion` media query. When the user has enabled reduced motion in their OS settings, all non-essential animations should be eliminated or replaced with instant state changes. The decision procedure:

- **Essential animations (keep but simplify):** Loading spinners, progress indicators, state transitions that communicate system status. Replace with simpler versions — a spinner can become a pulsing dot, a slide transition can become a crossfade, a bounce can become an instant state swap.
- **Decorative animations (remove entirely):** Celebratory confetti, hover bounces, parallax effects, background motion. These add delight for motion-tolerant users but cause discomfort (nausea, dizziness, disorientation) for vestibular disorder sufferers — approximately 35% of adults over 40 according to vestibular research.
- **Implementation:** Wrap all animation definitions in a `prefers-reduced-motion: no-preference` media query. The default (no media query) should be the reduced state, not the animated state. This ensures that users with reduced motion preferences see no animation by default.

```css
/* Default: reduced motion (accessible baseline) */
.button {
  transition: none;
}

/* Enhanced: animations for users who have not requested reduced motion */
@media (prefers-reduced-motion: no-preference) {
  .button {
    transition:
      transform 150ms ease-out,
      background-color 100ms ease;
  }
}
```

Material Design's motion documentation explicitly addresses this: all motion tokens have reduced-motion variants that replace transitions with instant state changes while preserving the visual state difference (the button still changes color on press, it just does not animate the change).

### Micro-Interaction Decision Framework

When deciding whether to add a micro-interaction, run this checklist:

1. **Does it communicate state change?** If the interaction tells the user something changed (toggle flipped, item added, action completed), it is functional. Proceed.
2. **Does it guide attention?** If the interaction draws the user's eye to where they need to look next (new item highlighted, error field pulsed), it is functional. Proceed.
3. **Does it confirm the user's action?** If the interaction acknowledges that the system received the user's input (button press, form submit), it is functional. Proceed.
4. **Does it only add visual delight?** If removing the interaction changes nothing about the user's ability to complete their task, it is decorative. Add it only if you have performance budget and it does not violate reduced motion preferences.
5. **Does it delay the user?** If the user must wait for the animation to complete before they can proceed, the interaction is hostile regardless of how beautiful it is. Redesign it to be non-blocking.

## Source

- Saffer, D. — _Microinteractions: Designing with Details_ (2013), the four-part framework
- Material Design — Motion documentation, https://m3.material.io/styles/motion
- Apple Human Interface Guidelines — Animation and haptic feedback
- Nielsen, J. — "Response Times: The 3 Important Limits" (1993), perceptual thresholds
- Google Web Fundamentals — "Animations and Performance" (compositor-only properties)
- W3C — "prefers-reduced-motion" media query specification, https://www.w3.org/TR/mediaqueries-5/#prefers-reduced-motion
- Vestibular Disorders Association — Research on motion sensitivity prevalence
- Thomas, B. and Tullis, T. — _Measuring the User Experience_ (2013), animation impact on task completion metrics

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
