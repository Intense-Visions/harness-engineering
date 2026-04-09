# Gestalt Figure-Ground

> Depth perception — distinguishing foreground from background, ambiguous figure-ground as a design tool, z-axis ordering, overlay and modal perception

## When to Use

- Designing modals, dialogs, drawers, or overlay surfaces that must feel "above" the main content
- Building elevation systems with shadow depths for cards, menus, popovers, and toasts
- Creating focus states where a selected element must clearly separate from its surroundings
- Designing dark mode color schemes where depth relationships must be maintained without shadows
- Evaluating why an overlay feels "flat," a modal does not feel modal, or a card does not lift off the page
- Implementing z-index strategies and preventing stacking context conflicts

## Instructions

1. **Understand the law.** The Gestalt principle of figure-ground states that the brain automatically separates visual input into a foreground figure (the object of attention) and a background ground (the surrounding context). This separation is not optional — the brain performs it on every visual scene. Design exploits this by controlling which elements read as "figure" (foreground, interactive, primary) and which read as "ground" (background, contextual, secondary).

   **The five cues that establish figure-ground:**
   - **Size:** Smaller elements tend to be perceived as figure; larger elements as ground
   - **Contrast:** Higher-contrast elements read as figure against lower-contrast ground
   - **Convexity:** Convex shapes (outward-curving) read as figure; concave regions as ground
   - **Lower region:** Elements in the lower portion of an ambiguous display tend to be ground
   - **Symmetry:** Symmetrical regions tend to be perceived as figure

2. **Create depth through elevation and shadow.** The primary mechanism for establishing figure-ground in digital interfaces is the shadow. A shadow beneath an element signals "this element is lifted above the surface, closer to the viewer."

   **Worked example — Material Design's elevation system:**
   Material Design codifies figure-ground as literal elevation measured in dp (density-independent pixels):
   - 0dp: page background (ground)
   - 1dp: cards, switches (`box-shadow: 0 1px 3px rgba(0,0,0,0.12), 0 1px 2px rgba(0,0,0,0.08)`)
   - 4dp: app bars, elevated buttons (`box-shadow: 0 4px 6px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06)`)
   - 8dp: menus, side sheets (`box-shadow: 0 8px 16px rgba(0,0,0,0.12), 0 4px 6px rgba(0,0,0,0.07)`)
   - 16dp: navigation drawers (`box-shadow: 0 16px 24px rgba(0,0,0,0.14), 0 6px 8px rgba(0,0,0,0.1)`)
   - 24dp: modals, dialogs (`box-shadow: 0 24px 38px rgba(0,0,0,0.14), 0 9px 46px rgba(0,0,0,0.12)`)

   Each level creates a stronger figure-ground separation. The user intuitively understands: higher shadow = closer to me = more important right now.

   **Decision procedure:** Assign each UI surface to one elevation level. Interactive overlays (menus, popovers, modals) must always be at a higher elevation than the content they overlay. Never place two overlapping surfaces at the same elevation — this creates ambiguous figure-ground.

3. **Use scrim/overlay to reinforce modal figure-ground.** When a modal or dialog appears, the content behind it must be visually demoted to "ground." The scrim (semi-transparent overlay) accomplishes this by reducing the contrast, color saturation, and clarity of the background content.

   **Worked example — Stripe's modal pattern:**
   - Scrim: `background: rgba(0, 0, 0, 0.4)` — dims the page to 60% brightness
   - Modal surface: white background, `border-radius: 12px`, shadow at Material 24dp equivalent
   - The scrim simultaneously (a) establishes the modal as figure by contrast, (b) suppresses the background as ground, and (c) signals "this content is blocked until the modal is resolved"
   - Scrim opacity matters: too light (0.1) and the background competes; too dark (0.8) and the context is lost. 0.3-0.5 is the effective range for most interfaces.

   **Worked example — Apple's iOS sheet presentation:**
   - The underlying view scales down to 95% and shifts slightly back (3D transform perspective)
   - The sheet slides up with a white background and higher shadow
   - This combines two figure-ground cues: shadow elevation AND size (the background becomes literally smaller, reinforcing its "ground" role)

4. **Apply figure-ground to card design.** Cards are the most common figure-ground pattern in web design. A card is a figure that lifts off the page ground.

   **Worked example — Stripe's pricing cards:**
   - Background: `#f6f9fc` (light blue-gray) — this is the ground
   - Cards: white background, subtle shadow (`0 2px 4px rgba(0,0,0,0.08)`) — these are the figures
   - The blue-tinted ground is critical: white cards on a white background have zero figure-ground separation (no contrast between figure and ground). The tinted background creates the contrast that makes cards "lift"
   - Shadow color: Stripe uses blue-tinted shadows (`rgba(50, 50, 93, 0.1)`) rather than pure black — this is more natural (real-world shadows pick up ambient color) and less harsh

   **Decision procedure for card backgrounds:**
   - White cards on white background: add shadow OR background tint. Shadow alone: `0 1px 3px rgba(0,0,0,0.1)`. Background tint: `#f5f5f5` to `#f0f4f8`.
   - White cards on tinted background: shadow optional — contrast alone creates separation. If adding shadow, keep it minimal (`0 1px 2px rgba(0,0,0,0.05)`).
   - Dark mode cards: use lighter card backgrounds on darker ground. Card: `#1e1e1e`, Ground: `#121212`. Shadow is nearly invisible in dark mode — rely on background contrast instead.

5. **Handle figure-ground in dark mode.** Dark mode inverts the typical figure-ground relationship. In light mode, shadows push elements upward. In dark mode, shadows are invisible against dark backgrounds. Material Design solves this by using surface lightness as the elevation signal:

   **Material Design dark mode elevation:**
   - 0dp (ground): `#121212`
   - 1dp (card): `#1e1e1e` (overlaid with 5% white)
   - 4dp (app bar): `#232323` (overlaid with 9% white)
   - 8dp (menu): `#2c2c2c` (overlaid with 12% white)
   - 16dp (drawer): `#333333` (overlaid with 15% white)
   - 24dp (modal): `#383838` (overlaid with 16% white)

   Higher = lighter. The brain interprets lighter surfaces as closer (figure) and darker surfaces as farther (ground). This maintains the figure-ground hierarchy without any shadows.

6. **Exploit ambiguous figure-ground deliberately.** In rare cases, ambiguous figure-ground creates visual interest. The classic example is Rubin's vase — the same image can be seen as a vase (figure) or two faces (ground), depending on the viewer's focus.

   **Worked example — negative space logos:**
   - FedEx: the arrow between the E and x is ground that becomes figure when noticed
   - NBC: the white space between colored feathers forms a peacock
   - These work because the ambiguity is resolvable — both interpretations are meaningful

   **When to use ambiguity in interfaces:** Almost never. Interface design demands unambiguous figure-ground so users know what is interactive (figure) and what is context (ground). Ambiguity belongs in branding and illustration, not in functional UI.

## Details

### Z-Index Strategy

Figure-ground in CSS is managed through z-index, and mismanaged z-index is the most common implementation failure of figure-ground design.

**Define a z-index scale (not arbitrary values):**

| Level    | z-index | Usage                             |
| -------- | ------- | --------------------------------- |
| Base     | 0       | Page content, ground              |
| Raised   | 10      | Cards, sticky headers             |
| Dropdown | 100     | Dropdowns, popovers, tooltips     |
| Overlay  | 200     | Scrims, sidebar overlays          |
| Modal    | 300     | Modals, dialogs                   |
| Toast    | 400     | Toast notifications, snackbars    |
| Maximum  | 500     | Development tools, debug overlays |

**Never use z-index values like 9999, 99999, or 2147483647.** These indicate a z-index arms race where developers are fighting stacking context conflicts by escalating values. The fix is a defined scale — every surface has one correct level.

**Stacking context isolation:** Use `isolation: isolate` on component root elements to create new stacking contexts. This prevents a z-index inside one component from competing with z-index in another component. A `z-index: 100` inside an isolated component cannot escape to compete with a `z-index: 50` in the global context.

### Figure-Ground in Data Tables

Tables present a figure-ground challenge: which rows are figure and which are ground?

- **Zebra striping** alternates row backgrounds (`#fff` / `#f9fafb`) to create micro figure-ground separation between rows. This improves scan accuracy for wide tables where the eye might drift to an adjacent row.
- **Hover state** temporarily promotes a row to figure: `background: #eef2ff` (blue tint) on hover signals "this row is selected as figure."
- **Selected row** uses stronger figure treatment: `background: #e0e7ff` plus a left border accent (`border-left: 3px solid #4f46e5`). The border adds a convexity cue — the row "extends toward the viewer."

### Layered Figure-Ground (Nested Depth)

Complex interfaces have multiple figure-ground layers:

1. Page background (deepest ground)
2. Content cards (figure relative to page, ground relative to popovers)
3. Popover menus (figure relative to cards)
4. Modal dialogs (figure relative to everything)
5. Toast notifications (figure relative to modals — the only thing above modals)

Each layer must maintain unambiguous separation from adjacent layers. If a popover and a card have the same shadow depth, the popover does not feel "above" the card — its figure-ground status is ambiguous.

### Anti-Patterns

1. **Flat modals (no scrim, no shadow).** A modal that appears as a white box on a white page with no scrim or elevation. The brain cannot determine that this is figure — it reads as "another card appeared" rather than "an overlay is demanding my attention." Fix: always use a scrim (rgba backdrop) plus a shadow that exceeds any other shadow on the page. The modal must be at the highest elevation in the system.

2. **Shadow inflation.** Every element has a drop shadow — cards, buttons, inputs, headers, footers. When everything casts a shadow, nothing lifts off the ground. Shadow becomes noise rather than signal. Fix: reserve shadows for true figure-ground separation (cards on a page, menus over content, modals over everything). Flat elements (buttons, inputs, text) should not have shadows in their default state. Stripe uses shadows on exactly two things: cards and modals.

3. **Z-index escalation.** Starting with `z-index: 1` for a dropdown, then needing `z-index: 10` for a modal, then `z-index: 9999` for a toast because a third-party widget injected `z-index: 1000`. Fix: define a z-index scale as a design token. Use stacking context isolation. Audit third-party widgets for rogue z-index values.

4. **Identical elevation on overlapping surfaces.** Two overlapping cards with the same shadow — which is on top? The brain cannot resolve this. Fix: any surface that overlaps another must be at a visibly different elevation. If two cards can overlap (e.g., in a draggable UI), the dragged card must gain elevation (increase shadow) to signal "I am above."

### Real-World Examples

**Stripe's Blue-Tinted Shadows:**

- Card shadow: `0 13px 27px -5px rgba(50, 50, 93, 0.25), 0 8px 16px -8px rgba(0, 0, 0, 0.3)`
- The first shadow is blue-tinted (Stripe's brand color influence), creating a subtle cool depth
- The second shadow is darker and tighter, anchoring the card to the page
- This dual-shadow technique creates more natural-feeling depth than a single shadow — real objects cast both a diffuse ambient shadow and a tighter contact shadow

**Material Design Elevation System:**

- The spec defines 25 elevation levels (0-24dp), but most apps use only 5-6
- Elevation is a first-class design token: `--md-sys-elevation-level1` through `--md-sys-elevation-level5`
- In dark mode, elevation is expressed as surface tint rather than shadow — a fundamentally different rendering that maintains the same semantic meaning (higher = figure)
- The FAB (Floating Action Button) sits at 6dp — higher than cards (1dp) but lower than modals (24dp) — establishing a clear mid-layer figure position

**Apple's Sheet Presentation:**

- iOS 15+ presents sheets with the parent view scaled to ~95% and pushed slightly back
- The sheet's white surface at full scale + the parent at reduced scale creates an unambiguous figure-ground separation using three cues simultaneously: shadow, size, and position
- Interactive dismissal (drag down) smoothly reverses the figure-ground — the sheet shrinks as the parent grows back, maintaining the depth metaphor throughout the animation

**Vercel's Minimal Elevation:**

- Vercel uses almost no shadows — depth is created entirely through background contrast
- Cards: white background on `#fafafa` ground, no shadow, 1px border `#eaeaea`
- This "flat depth" approach works because the border provides just enough figure-ground separation
- Modals: full scrim (`rgba(0,0,0,0.5)`) + white surface — the only place Vercel uses strong depth cues, making modals feel significantly more elevated by contrast with the normally flat interface

## Source

- Edgar Rubin, "Visual Figures" (1915) — original figure-ground segregation research
- Stephen Palmer, "Vision Science: Photons to Phenomenology" — modern figure-ground perception
- Material Design elevation documentation (m3.material.io/styles/elevation)
- "Designing Interfaces" by Jenifer Tidwell, Charles Brewer, and Aynne Valencia

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
