# Material Design 3 (Material You)

> Google's adaptive design language covering dynamic color extraction from wallpaper, HCT-based tonal palettes, elevation through tonal surface color rather than drop shadows, shape theming with corner families, and choreographed motion with shared-axis transitions.

## When to Use

- Building Android apps targeting API 31+ where dynamic color is available via `DynamicColors.applyToActivitiesIfAvailable()`
- Implementing a component library using Material 3 tokens (`md.sys.color.*`, `md.sys.shape.*`, `md.sys.motion.*`)
- Migrating from Material Design 2 to M3 where elevation model, color roles, and shape system have fundamentally changed
- Creating a cross-platform design system that includes Android as a primary target and must honor M3 conventions
- Theming an app where the seed color must propagate through 5 tonal palettes and 29 color roles without manual per-role assignment

## Instructions

Material Design 3 is a generative design system. Instead of prescribing fixed palettes, it derives an entire theme from a single seed color using the HCT (Hue, Chroma, Tone) color space. Every surface, text, and icon color is a deterministic function of that seed. This means understanding M3 requires understanding HCT math, the tonal palette generation algorithm, the 29 color role mappings, the tonal elevation model, shape corner families, and motion easing choreography.

**The generative pipeline:** Seed color (e.g., `#6750A4`) -> HCT decomposition (H:282, C:34, T:40) -> 5 tonal palettes (Primary, Secondary, Tertiary, Neutral, Neutral Variant) -> 13 tones per palette (0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 95, 99, 100) -> 29 color roles mapped to specific palette+tone combinations -> component token resolution.

**Key departure from M2:** Elevation no longer uses shadow intensity. M3 uses tonal surface color -- a surface at elevation 3 is tinted with the primary color at a specific opacity, not darkened with a shadow. Shadows exist only for components that physically overlap (FAB, dialogs, bottom sheets).

## Details

### Dynamic Color and HCT Color Space

HCT (Hue, Chroma, Tone) is Google's perceptually uniform color space that combines CAM16 hue and chroma with L\* (CIELAB lightness) as the tone axis. Unlike HSL, HCT guarantees that tone 40 in any hue produces the same perceived brightness.

**Seed to palette algorithm:**

1. Extract the seed color's HCT values. For `#6750A4`: H=282, C=34, T=40.
2. Generate the Primary tonal palette: hold H=282, set C to max achievable at each tone, generate 13 tones (0-100).
3. Generate Secondary: shift H by 0, reduce C by ~33%. For seed C=34, secondary C~22.
4. Generate Tertiary: rotate H by +60 degrees (282+60=342), maintain similar C. This creates an analogous accent.
5. Generate Neutral: hold H=282, reduce C to ~4. Near-gray with a hint of the seed hue.
6. Generate Neutral Variant: hold H=282, reduce C to ~8. Slightly more chromatic neutral.

**Concrete palette output for seed `#6750A4`:**

```
Primary     T40: #6750A4  T80: #D0BCFF  T90: #EADDFF
Secondary   T40: #625B71  T80: #CCC2DC  T90: #E8DEF8
Tertiary    T40: #7D5260  T80: #EFB8C8  T90: #FFD8E4
Neutral     T40: #605D62  T80: #C9C5CA  T90: #E6E1E5
NeutralVar  T40: #605D66  T80: #CAC4D0  T90: #E7E0EC
```

**Color role mapping (light theme):** The 29 roles map palette+tone combinations to semantic purposes:

```
md.sys.color.primary:              Primary T40     (#6750A4)
md.sys.color.on-primary:           Primary T100    (#FFFFFF)
md.sys.color.primary-container:    Primary T90     (#EADDFF)
md.sys.color.on-primary-container: Primary T10     (#21005D)
md.sys.color.surface:              Neutral T99     (#FFFBFE)
md.sys.color.on-surface:           Neutral T10     (#1C1B1F)
md.sys.color.surface-variant:      NeutralVar T90  (#E7E0EC)
md.sys.color.outline:              NeutralVar T50  (#79747E)
```

**Dark theme inversion:** Swap tone positions. Where light uses T40 for primary, dark uses T80. Where light uses T90 for container, dark uses T30. The hue and chroma remain identical -- only tone shifts.

```
Light: primary = Primary T40, primary-container = Primary T90
Dark:  primary = Primary T80, primary-container = Primary T30
```

### Tonal Elevation Model

M3 replaces shadow-based elevation with surface tint. A surface at a higher elevation receives more primary color overlay, creating a subtle tonal shift that implies depth without casting shadows.

**Elevation levels and tint opacities:**

```
Level 0:  0dp   -> 0% primary tint    (base surface)
Level 1:  1dp   -> 5% primary tint    (cards, navigation rail)
Level 2:  3dp   -> 8% primary tint    (top app bar, scrolled)
Level 3:  6dp   -> 11% primary tint   (FAB, search bar)
Level 4:  8dp   -> 12% primary tint   (navigation drawer)
Level 5:  12dp  -> 14% primary tint   (dialogs, bottom sheets)
```

**Implementation in CSS:** Compose the surface color with a primary overlay:

```css
/* Level 2 surface in light theme */
.surface-level-2 {
  background-color: color-mix(in srgb, var(--md-sys-color-primary) 8%, var(--md-sys-color-surface));
}
```

**When shadows still apply:** Physical overlap components -- FAB hovering over content, dialog overlaying the page, bottom sheet sliding up -- still cast shadows. The shadow uses `md.sys.elevation.shadow` tokens. But a Card at elevation 1 gets tint only, no shadow.

**Dark mode elevation:** The tint effect is more visible because the base surface is dark (Neutral T6, ~`#1C1B1F`). A 5% primary tint on near-black is perceptually stronger than 5% on near-white. M3 accounts for this -- the tint percentages are the same, but the visual distinction is naturally stronger in dark mode.

### Shape Theme System

M3 defines shape using corner families (rounded, cut) and size scales. Every component maps to a shape token that resolves to a specific corner radius.

**Shape scale:**

```
md.sys.shape.corner.none:        0dp     (full-screen sheets)
md.sys.shape.corner.extra-small: 4dp     (text fields, snackbars)
md.sys.shape.corner.small:       8dp     (chips, menus)
md.sys.shape.corner.medium:      12dp    (cards, dialogs)
md.sys.shape.corner.large:       16dp    (FAB, navigation drawer)
md.sys.shape.corner.extra-large: 28dp    (bottom sheets expanded)
md.sys.shape.corner.full:        50%     (badges, pills, circular FAB)
```

**Shape families:** Round (default) uses `border-radius`. Cut uses `clip-path` with angled corners. A card with `shape.corner.medium` in the cut family becomes a chamfered rectangle at 12dp.

**Morphing shapes:** FAB transitions from `corner.large` (16dp rounded) at rest to `corner.full` (circular) when scrolling collapses it to a mini-FAB. This morph is animated over 300ms with the `emphasized` easing curve.

### Motion Choreography

M3 motion uses shared-axis transitions, container transforms, and three easing curve families.

**Easing curves (cubic-bezier values):**

```
md.sys.motion.easing.emphasized:           cubic-bezier(0.2, 0.0, 0, 1.0)
md.sys.motion.easing.emphasized-decelerate: cubic-bezier(0.05, 0.7, 0.1, 1.0)
md.sys.motion.easing.emphasized-accelerate: cubic-bezier(0.3, 0.0, 0.8, 0.15)
md.sys.motion.easing.standard:             cubic-bezier(0.2, 0.0, 0, 1.0)
md.sys.motion.easing.standard-decelerate:  cubic-bezier(0.0, 0.0, 0, 1.0)
md.sys.motion.easing.standard-accelerate:  cubic-bezier(0.3, 0.0, 1.0, 1.0)
```

**Duration tokens:**

```
md.sys.motion.duration.short1:   50ms    (ripple fade-in)
md.sys.motion.duration.short2:   100ms   (icon state change)
md.sys.motion.duration.medium1:  250ms   (card expand)
md.sys.motion.duration.medium2:  300ms   (FAB morph)
md.sys.motion.duration.long1:    450ms   (page transition)
md.sys.motion.duration.long2:    500ms   (full-screen expand)
```

**Shared-axis transitions:** Forward navigation slides content along the Z-axis (incoming element scales from 80% to 100%, outgoing fades). Lateral navigation uses X-axis (tabs slide left/right). Vertical feeds use Y-axis.

**Container transform:** A card expanding to a detail page morphs its bounding rectangle. The card's corner radius animates from `corner.medium` (12dp) to `corner.none` (0dp). Internal content cross-fades during the morph. Duration: `long1` (450ms) with `emphasized` easing.

### Anti-Patterns

**Using drop shadows for all elevation levels.** M3 reserves shadows for physically overlapping components. Applying `box-shadow` to cards, app bars, and navigation rails replicates M2 behavior and defeats the tonal elevation model. A Card at elevation 1 should show a 5% primary tint on its background -- not a `0 1px 3px rgba(0,0,0,0.12)` shadow.

**Hardcoding color hex values instead of using the 29 color roles.** If your button uses `background: #6750A4` instead of `background: var(--md-sys-color-primary)`, dynamic color cannot propagate. When the user's wallpaper changes the seed, your button stays purple while the rest of the app adapts. Every color reference must resolve through the `md.sys.color.*` role system.

**Ignoring the secondary and tertiary palettes.** Teams that only use Primary for all accents produce monotone interfaces. M3 generates Secondary (reduced chroma, same hue) for less prominent elements like chips and toggles, and Tertiary (rotated hue) for complementary accents like FABs or progress indicators. Using only Primary collapses the visual hierarchy.

**Applying the emphasized easing curve to all animations.** `emphasized` (0.2, 0.0, 0, 1.0) is designed for transitions where content enters the viewport -- container transforms, page transitions. Micro-interactions like ripple effects and icon toggles should use `standard` easing. Applying emphasized easing to a ripple makes it feel sluggish because the initial slow phase is perceptible at short durations (50-100ms).

**Static shape tokens that ignore responsive morphing.** A FAB that stays at `corner.large` (16dp) when scrolling, instead of morphing to `corner.full` (circular mini-FAB), breaks the M3 motion contract. Shape is not static -- components have rest, pressed, and transitional shape states that animate along the shape scale.

### Real-World Examples

**Google Photos** uses dynamic color to tint its surface backgrounds from the user's wallpaper. On a phone with a sunset wallpaper (seed ~`#D4613C`), the Primary palette shifts to warm orange-browns, the app bar gets a Level 2 tonal tint (8% primary on surface), and chips use Secondary container colors. The entire 29-role mapping regenerates in ~16ms on Pixel 7.

**Google Clock** demonstrates tonal elevation in its alarm list. Each alarm card sits at elevation 1 (5% primary tint). When expanded, the card animates to elevation 3 (11% primary tint) using a container transform over 250ms with emphasized easing. No shadow is added -- the tint shift alone conveys the depth change.

**YouTube Music** uses the Tertiary palette for its mini-player progress bar, creating a complementary accent against the Primary-tinted navigation bar. The Tertiary hue is rotated +60 degrees from the dynamic seed, ensuring visual contrast without manual color selection.

**Google Keep** applies shape theming where notes use `corner.medium` (12dp rounded), labels use `corner.full` (pill shape), and the compose FAB uses `corner.large` (16dp) that morphs to `corner.extra-large` (28dp) when expanded into a full compose sheet.

## Source

Google Material Design 3 specification (material.io/design, 2024). Material Color Utilities library documentation (github.com/material-foundation/material-color-utilities). Android Developers "Dynamic Color" guide. Material Theme Builder tool documentation.

## Process

1. Read the instructions and examples in this document.
2. Apply the patterns to your implementation, adapting to your specific context.
3. Verify your implementation against the details and edge cases listed above.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.

## Success Criteria

- The patterns described in this document are applied correctly in the implementation.
- Edge cases and anti-patterns listed in this document are avoided.
