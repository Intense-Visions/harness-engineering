# Elevation & Shadow

> Depth as information — shadow anatomy (offset, blur, spread, color), elevation scale, chromatic shadows, material metaphor, dark mode shadows

## When to Use

- Designing card, modal, dropdown, or popover components that need to communicate z-axis position
- Building an elevation system or design token scale for a component library
- Choosing between shadow-based depth and tonal surface color for hierarchy
- Implementing dark mode where traditional black shadows disappear against dark backgrounds
- Evaluating whether a shadow is communicating interaction state (hover lift, press sink) or static hierarchy
- Debugging visual clutter caused by too many competing shadow layers
- Creating chromatic shadows that match a brand palette rather than defaulting to neutral gray
- Any decision about which element should appear "above" or "below" another in visual stacking order

## Instructions

1. **Treat elevation as a semantic variable, not a decorative effect.** Every shadow in a system must answer the question: "Why is this element above that one?" Elevation encodes hierarchy — a dropdown menu floats above the page because it is temporary and demands immediate attention; a card sits slightly above the canvas because it is a discrete, interactive object. If you cannot articulate why an element is elevated, it should not have a shadow. Material Design 3 defines elevation levels 0 through 5, where each level corresponds to a semantic role: Level 0 is the canvas, Level 1 is cards and rails, Level 2 is buttons and chips, Level 3 is navigation bars, Level 4 is dialogs and menus, Level 5 is modals and FABs.

2. **Understand the four parameters of box-shadow and what each communicates.** The CSS `box-shadow` property accepts `offset-x`, `offset-y`, `blur-radius`, `spread-radius`, and `color`. Each parameter carries visual meaning: offset defines light direction (consistent offset across all shadows implies a single global light source), blur defines altitude (higher elements cast softer, wider shadows), spread defines edge sharpness (negative spread creates inner glow, positive spread creates ambient fill), and color defines atmosphere (neutral gray shadows feel clinical, tinted shadows feel integrated). A shadow with `0 4px 6px -1px rgba(0,0,0,0.1)` communicates a light source directly above, moderate elevation, sharp contact edge, and neutral atmosphere.

3. **Use multi-layer shadows for photorealistic depth.** Real-world objects cast at least two shadow types simultaneously: a sharp, dark contact shadow directly beneath the object (small offset, minimal blur, darker opacity) and a diffuse ambient shadow that spreads broadly (larger offset, more blur, lighter opacity). Single-layer shadows look flat and synthetic. Stripe uses a consistent two-layer pattern: `0 1px 3px rgba(50,50,93,0.15), 0 1px 0 rgba(0,0,0,0.02)` — the first layer is a soft ambient shadow with a blue-gray tint, the second is a razor-thin contact shadow. This dual-layer approach creates convincing depth from just two declarations.

4. **Build an elevation scale as design tokens.** Define 4-6 elevation levels as named tokens, not ad-hoc values. Each level should increase blur by 1.5-2x and offset by 1.5x from the previous level. A concrete scale:
   - `--shadow-xs`: `0 1px 2px 0 rgba(0,0,0,0.05)` — subtle lift, input fields, dividers
   - `--shadow-sm`: `0 1px 3px 0 rgba(0,0,0,0.1), 0 1px 2px -1px rgba(0,0,0,0.1)` — cards, buttons
   - `--shadow-md`: `0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)` — dropdowns, popovers
   - `--shadow-lg`: `0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -4px rgba(0,0,0,0.1)` — dialogs, drawers
   - `--shadow-xl`: `0 20px 25px -5px rgba(0,0,0,0.1), 0 8px 10px -6px rgba(0,0,0,0.1)` — modals, overlays
   - `--shadow-2xl`: `0 25px 50px -12px rgba(0,0,0,0.25)` — maximum elevation, full-screen overlays
     Tailwind CSS uses exactly this 6-step scale. Never invent shadow values outside your scale.

5. **Maintain a consistent light source direction across the entire interface.** If your shadows cast downward (positive y-offset), every element in the system must cast downward. A top-bar with `0 2px 4px` and a bottom-bar with `0 -2px 4px` implies two light sources, which creates visual incoherence. Material Design specifies a single key light at top-center and an ambient fill light, producing shadows that always fall downward and slightly outward. The only exception: inset shadows (e.g., pressed buttons) which represent the inverse — a concavity rather than a protrusion.

6. **Use chromatic shadows to create visual warmth and brand integration.** Traditional shadows use `rgba(0,0,0,opacity)`, which produces cold, detached depth. Chromatic shadows tint the shadow color to match the element or the brand palette. Stripe's signature shadow uses `rgba(50,50,93,0.25)` — a desaturated indigo that matches their brand blue. The formula: take your dominant brand hue, desaturate by 40-60%, darken by 20-30%, and use at 15-25% opacity. For colored cards or buttons, sample the background color of the element, darken it by 30-40%, and apply at 25-40% opacity. A red button with shadow `0 4px 14px rgba(220,38,38,0.35)` creates a colored glow that makes the button appear to emit light.

7. **Handle dark mode shadows with surface tinting instead of shadow darkening.** On dark backgrounds, shadows become nearly invisible because there is no contrast between a dark shadow and a dark surface. Material Design 3 solves this by replacing shadow-based elevation with tonal surface color — higher-elevation surfaces receive a lighter tint of the primary color. At Level 0, the surface is the base dark color (`#1C1B1F`). At Level 1, a 5% primary color overlay is applied. At Level 2, 8%. At Level 3, 11%. At Level 5, 14%. This preserves hierarchy without relying on shadows that would disappear. If you must use shadows in dark mode, increase opacity to 40-60% (versus 10-15% in light mode) and add a 1px top border at 5-8% white opacity to simulate the rim light that gives real-world objects definition in low-light environments.

8. **Use elevation transitions to communicate interaction state.** Interactive elements should change elevation on hover and press to create physical metaphor. On hover, a card rises: increase shadow from `--shadow-sm` to `--shadow-md` over 200ms with `ease-out`. On press, a button sinks: decrease shadow from `--shadow-sm` to `--shadow-xs` (or inset) over 100ms with `ease-in`. Material Design specifies: resting state = base elevation, hover = base + 2dp, pressed = base - 1dp, dragged = base + 8dp. The transition must be smooth — never snap between shadow levels. Animate `box-shadow` directly (acceptable performance in modern browsers) or use `filter: drop-shadow()` for GPU-accelerated transitions on elements with complex shapes.

## Details

### Shadow Anatomy Deep Dive

**Offset (x, y).** The offset pair defines the shadow's displacement from the element. In UI design, x-offset is almost always 0 (light from directly above) and y-offset is positive (light casts downward). Non-zero x-offset implies a lateral light source, which can work for stylistic effects but breaks the physical metaphor when mixed with zero-offset shadows elsewhere. Material Design's key light produces y-offset proportional to elevation: 1dp elevation = 1px y-offset, 4dp = 4px, 8dp = 8px. This linear relationship is a simplification — real shadow offset follows trigonometry based on light angle — but it works perceptually.

**Blur.** Blur radius controls shadow softness. A 0px blur creates a hard-edged shadow (like a cutout). Blur increases with elevation because higher objects are farther from the surface they cast onto. The mapping: blur = 2 _ y-offset for ambient shadows, blur = 0.5 _ y-offset for contact shadows. A card at 4px offset might have an ambient layer with 8px blur and a contact layer with 2px blur.

**Spread.** Spread expands (positive) or contracts (negative) the shadow before blur is applied. Negative spread is the secret to realistic multi-layer shadows — it prevents the ambient shadow from creating a visible hard edge beyond the element boundary. Tailwind's `--shadow-md` uses `-1px` spread on its first layer and `-2px` on its second layer, pulling the shadow inward so it only appears as soft diffusion, not as a visible border.

**Color and Opacity.** Shadow opacity should decrease as blur increases. Contact shadows (small blur) are 10-20% opacity. Ambient shadows (large blur) are 5-10% opacity. In total, no shadow stack should exceed 30% cumulative perceived darkness — beyond this, the shadow becomes a visual distraction rather than a depth cue. Stripe keeps total shadow opacity around 17-27%: `rgba(50,50,93,0.25)` plus `rgba(0,0,0,0.02)`.

### Elevation Scale: Material Design 3 vs. Practice

Material Design 3 defines elevation as a 0-5 scale mapped to dp values:

| Level | dp  | Semantic Role               | Shadow + Tint (Light) | Tint Only (Dark)     |
| ----- | --- | --------------------------- | --------------------- | -------------------- |
| 0     | 0   | Canvas, background          | No shadow             | Base surface color   |
| 1     | 1   | Cards, navigation rail      | Subtle shadow         | +5% primary overlay  |
| 2     | 3   | Buttons, chips, text fields | Light shadow          | +8% primary overlay  |
| 3     | 6   | Navigation bar, snackbar    | Medium shadow         | +11% primary overlay |
| 4     | 8   | Menus, dialogs (temporary)  | Strong shadow         | +12% primary overlay |
| 5     | 12  | Modal, FAB                  | Maximum shadow        | +14% primary overlay |

In practice, most design systems collapse this to 3-4 meaningful levels: resting (cards), raised (hover/focus), floating (dropdowns/popovers), and overlay (modals/dialogs). The intermediate distinctions (Level 2 vs Level 3) are rarely perceptible to users and add token complexity without visual payoff.

### Chromatic Shadow Recipes

**Brand-tinted neutral shadow (Stripe-style):** Take your brand primary (e.g., `#635BFF` Stripe indigo). Desaturate to ~35% saturation, darken to ~30% lightness. Result: `rgb(50,50,93)`. Apply at 20-25% opacity. Pair with a near-black contact shadow at 2-5% opacity.

**Element-colored glow shadow:** For colored UI elements (colored buttons, tags, cards), sample the element's background. Increase saturation by 10%, reduce lightness by 25%. Apply at 30-40% opacity with large blur (14-20px). Example: a button with `bg: #3B82F6` gets shadow `0 4px 14px rgba(37,99,235,0.35)`. This creates a "glowing" effect that makes the element appear self-luminous.

**Warm ambient shadow:** For interfaces aiming for warmth (consumer apps, lifestyle brands), use `rgba(0,0,0,opacity)` only for the contact layer. Replace the ambient layer with a warm tint: `rgba(120,80,40,0.08)` — a desaturated brown-amber. This eliminates the clinical coldness of pure black shadows without being obviously colored.

### Anti-Patterns

1. **Shadow Soup.** Applying shadows to every element on the page — every card, every button, every divider, every section, every icon container. When everything is elevated, nothing is. Shadows work through contrast: an elevated element stands out because the elements around it are flat. If 15 cards on a page all have identical `--shadow-md`, the shadows communicate nothing about relative importance. Fix: use shadows only on interactive elements and temporary surfaces (dropdowns, modals). Let non-interactive content sit at Level 0.

2. **Inconsistent Light Sources.** A card has shadow `0 4px 8px` (light from above) while a sidebar has shadow `4px 0 8px` (light from the left) and a footer has shadow `0 -4px 8px` (light from below). Three different light sources on one page create subconscious visual anxiety — the scene is physically impossible. Fix: audit all shadows in the system and normalize to a single light direction. Use a design token for shadow direction so it cannot drift.

3. **Dark Mode Shadow Copy-Paste.** Using the same `rgba(0,0,0,0.1)` shadows in dark mode as in light mode. Against a `#1A1A1A` background, a 10% black shadow is invisible. The elevation hierarchy vanishes entirely. Fix: implement tonal surface color for dark mode (Material Design 3 approach) or increase dark mode shadow opacity to 40-60% and add a subtle top-edge rim highlight (`border-top: 1px solid rgba(255,255,255,0.06)`).

4. **Elevation Inflation.** Starting with `--shadow-xl` for basic cards because "it looks more dramatic." This leaves no headroom for dropdowns, dialogs, and modals that genuinely need higher elevation. The result: modals that do not feel like they are above the page because cards already used the maximum shadow. Fix: start at the lowest elevation that creates perceptible depth (usually `--shadow-sm` for cards) and reserve higher levels for progressively more temporary, attention-demanding surfaces.

5. **Animating Box-Shadow Without Compositor Fallback.** Transitioning `box-shadow` directly triggers paint on every frame, which causes jank on lower-powered devices. For high-performance shadow transitions, use a pseudo-element (`::after`) with the target shadow applied at full opacity, and animate only the pseudo-element's `opacity` — a compositor-only property. The element appears to transition between shadow states smoothly while only opacity is actually being interpolated.

### Shadow Performance and Implementation

**The pseudo-element opacity technique.** Animating `box-shadow` directly triggers paint on every frame. The performant alternative: create a `::after` pseudo-element with the target (hover/active) shadow applied at `opacity: 0`. On state change, animate only `opacity` to 1. The browser composites the opacity change on the GPU without repainting the shadow.

```css
.card {
  position: relative;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
}
.card::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  opacity: 0;
  transition: opacity 200ms ease-out;
  pointer-events: none;
}
.card:hover::after {
  opacity: 1;
}
```

This technique is used by Tailwind UI and Radix Themes for their card hover effects. The shadow itself never animates — only its visibility changes, which is a compositor-only operation.

**`filter: drop-shadow()` vs `box-shadow`.** `box-shadow` applies to the element's box model — it follows the rectangular boundary (plus border-radius). `filter: drop-shadow()` applies to the element's alpha channel — it follows the visual shape of the content, including transparent regions in PNGs and SVGs. For non-rectangular elements (icons, irregularly shaped images, clipped elements), `drop-shadow` produces correct shadows while `box-shadow` produces a rectangular shadow that ignores the element's visual shape. However, `drop-shadow` does not support `spread` or `inset` parameters, and it applies to the entire stacking context including children.

**Shadow tokens in design systems.** When building tokens, encode both the shadow value and its semantic role. Tailwind's approach (`shadow-sm`, `shadow-md`) encodes only size. A more expressive system encodes intent: `--shadow-card-resting`, `--shadow-card-hover`, `--shadow-dropdown`, `--shadow-modal`, `--shadow-inset-pressed`. This prevents developers from choosing shadows by visual inspection ("this one looks about right") and instead choosing by semantic role ("this is a dropdown, so it uses the dropdown shadow"). Radix Themes uses semantic shadow tokens: `shadow-2` for cards, `shadow-3` for raised buttons, `shadow-4` for dropdowns, `shadow-5` for dialogs, `shadow-6` for popovers.

### Elevation Decision Framework

When deciding on elevation for a new component, run this procedure:

1. **Is the element persistent or temporary?** Persistent elements (cards, sidebars, toolbars) use Level 1-2 shadows. Temporary elements (dropdowns, tooltips, modals) use Level 3-5 shadows. Temporary elements must be visually "above" persistent elements.
2. **Does the element overlap other content?** If yes, it must have a shadow to explain the overlap. A dropdown that covers page content without a shadow looks like a rendering bug. Modals without shadows (or scrims) create visual confusion about what is interactive.
3. **Is the element interactive?** Interactive elements benefit from elevation change on hover/press. Non-interactive elements (static cards, info panels) should not change elevation because elevation change implies clickability.
4. **Is this dark mode?** If yes, favor tonal surface color over shadows. Reserve shadows for high-elevation temporary surfaces (modals, dialogs) where tonal difference alone is insufficient.
5. **What is the highest elevation on this screen?** Ensure your new element does not exceed the modal/dialog level unless it is a modal/dialog. Elevation inflation makes true overlays less effective.

### Real-World Examples

**Stripe's Elevation Language.** Stripe uses a consistent two-layer chromatic shadow system across their entire dashboard and marketing pages. Their signature shadow — `0 13px 27px -5px rgba(50,50,93,0.25), 0 8px 16px -8px rgba(0,0,0,0.3)` — appears on elevated cards in their pricing page. The indigo tint (`rgba(50,50,93,...)`) ties the shadow to Stripe's brand palette. On hover, cards transition to a higher elevation with increased blur and offset over 250ms, creating a physical "lift" that signals interactivity. Their payment form inputs use the lowest elevation: `0 1px 3px rgba(50,50,93,0.15), 0 1px 0 rgba(0,0,0,0.02)` — barely-there depth that differentiates inputs from the background without competing with card-level elevation.

**Material Design 3 Tonal Elevation.** MD3 broke from its own MD2 convention by making shadow optional in many contexts. In MD3's dark theme, a Level 2 surface is not "base color + shadow" but "base color + 8% primary color overlay." A surface with primary `#D0BCFF` at Level 2 in dark mode becomes `#1C1B1F` blended with 8% of `#D0BCFF`, producing `#2B2930`. This tonal approach creates a visible hierarchy even on OLED screens where true black (`#000000`) backgrounds make shadows impossible. The key insight: elevation can be communicated through lightness alone, without any shadow geometry.

**Apple's Vibrancy and Layer Depth.** Apple's design system uses material layers — thin, ultra-thin, thick — that combine blur, opacity, and vibrancy to communicate depth. A notification popup on macOS uses `NSVisualEffectView` with a material that blurs the background content underneath, creating depth through occlusion rather than shadow. The shadow is present but secondary: `0 22px 70px 4px rgba(0,0,0,0.56)` — a very large, dark shadow that exists primarily to darken the content beneath the overlay, not to create an edge effect. Apple pairs this with a 1px separator stroke at 12% white opacity that defines the modal's edge sharply against the blurred background.

**Vercel's Minimal Shadow System.** Vercel uses shadows sparingly, relying primarily on border and background color to communicate hierarchy. Their card component uses `box-shadow: 0 0 0 1px rgba(0,0,0,0.08)` — technically a shadow but functioning as a border (zero offset, zero blur, 1px spread). On hover, this transitions to `0 0 0 1px rgba(0,0,0,0.12), 0 4px 8px rgba(0,0,0,0.04)` — the border darkens slightly and a subtle ambient shadow appears. The total maximum opacity is 16%, making their shadows among the lightest in production design systems. This restraint works because Vercel's interface is primarily flat with strong contrast from black text on white backgrounds — shadows are supplementary rather than structural.

## Source

- Material Design 3 — Elevation documentation, https://m3.material.io/styles/elevation
- CSS Specification — `box-shadow` property, https://www.w3.org/TR/css-backgrounds-3/#box-shadow
- Stripe — Dashboard and marketing page shadow inspection (DevTools analysis)
- Tailwind CSS — Shadow scale documentation, https://tailwindcss.com/docs/box-shadow
- Apple Human Interface Guidelines — Materials and vibrancy
- Tobias Ahlin — "Smoother & sharper shadows with layered box-shadows" (blog post on multi-layer technique)
- Josh Comeau — "Designing Beautiful Shadows" (blog post on shadow design methodology)
- Material Design 2 to 3 migration — Elevation changes and tonal surface color adoption

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
