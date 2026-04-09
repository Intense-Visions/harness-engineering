# Fluent Design System (Fluent 2)

> Microsoft's cross-platform design system covering the five foundational elements (light, depth, motion, material, scale), Acrylic and Mica materials, reveal highlight interactions, connected animations, responsive container strategies, and the Fluent 2 token theming architecture.

## When to Use

- Building Windows apps (WinUI 3, WPF with Fluent theme) where Acrylic, Mica, and reveal highlight are platform expectations
- Developing Microsoft 365 integrations (Teams tabs, Outlook add-ins, SharePoint web parts) that must match Fluent 2 visual language
- Implementing a React-based UI using `@fluentui/react-components` (Fluent UI React v9) with Griffel CSS-in-JS and token theming
- Creating responsive layouts for apps that span desktop (1920px), tablet (1024px), and compact (320px) using Fluent's breakpoint and container strategy
- Migrating from Fluent 1 (Fabric) to Fluent 2 where the token system, component API, and material model have fundamentally changed

## Instructions

Fluent Design is organized around five foundational elements: **Light** (illumination that reveals interactive surfaces), **Depth** (layering that establishes hierarchy), **Motion** (animation that connects user actions to outcomes), **Material** (translucent surfaces that establish context), and **Scale** (adaptive layouts from 320px mobile to 3840px Surface Hub). Unlike Material Design's single-seed generative approach, Fluent uses a brand-token injection model: you provide a brand ramp (16 shades of your brand color), and the system maps those shades to 160+ semantic alias tokens.

**Key architectural distinction:** Fluent 2 separates "global tokens" (platform-level primitives like `colorNeutralBackground1`), "alias tokens" (semantic mappings like `colorBrandBackground`), and "component tokens" (per-component overrides). The alias layer is where theming happens. Swapping the alias-to-global mapping changes the entire application's appearance.

**Fluent is context-aware.** The same `Dialog` component renders with Acrylic material on Windows 11 (where the compositor supports real-time blur), falls back to a solid color with subtle noise texture on web (where backdrop-filter has performance implications), and uses Mica on Windows 11 desktop app backgrounds. Material selection is not a design choice -- it is a platform capability negotiation.

## Details

### The Five Foundational Elements

**Light** in Fluent manifests as reveal highlight -- a lighting effect that follows the cursor and illuminates interactive surface boundaries. On hover, a radial gradient (diameter ~120px, falloff from 12% white at center to 0% at edge) follows the pointer, making borders and clickable regions glow. This effect answers the question "what can I interact with?" without requiring explicit affordances.

**Reveal highlight implementation (CSS approximation):**

```css
.fluent-reveal {
  position: relative;
  overflow: hidden;
}
.fluent-reveal::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(
    circle 120px at var(--mouse-x) var(--mouse-y),
    rgba(255, 255, 255, 0.12) 0%,
    rgba(255, 255, 255, 0.04) 40%,
    transparent 100%
  );
  pointer-events: none;
}
```

The JavaScript component tracks `mousemove` events and updates `--mouse-x` / `--mouse-y` CSS custom properties. On Windows 11 with WinUI 3, this is handled natively by the compositor at 60fps with no JavaScript overhead.

**Depth** uses three explicit layers: Base (z=0, app content), Raised (z=8, cards and commanding surfaces), and Overlay (z=32, dialogs, flyouts, teaching tips). Each layer has a corresponding shadow token:

```
shadow2:    0 1px 2px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12)     (Raised)
shadow4:    0 2px 4px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12)     (Commanding)
shadow8:    0 4px 8px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12)     (Cards)
shadow16:   0 8px 16px rgba(0,0,0,0.14), 0 0 2px rgba(0,0,0,0.12)    (Flyouts)
shadow28:   0 14px 28px rgba(0,0,0,0.24), 0 0 8px rgba(0,0,0,0.20)   (Dialogs)
shadow64:   0 32px 64px rgba(0,0,0,0.24), 0 0 8px rgba(0,0,0,0.20)   (Full overlays)
```

Each shadow uses a dual-layer technique: a larger spread for the ambient term and a tighter spread for the key light.

**Motion** uses four duration tiers and two easing families:

```
Duration:
  ultraFast:   50ms     (checkbox check, toggle snap)
  fast:        100ms    (button press feedback)
  normal:      200ms    (panel slide, card expand)
  slow:        300ms    (page transition, dialog enter)
  slower:      500ms    (connected animation, full-screen morph)

Easing:
  accelerate:  cubic-bezier(0.9, 0.1, 1.0, 0.2)     (element exiting)
  decelerate:  cubic-bezier(0.1, 0.9, 0.2, 1.0)     (element entering)
  linear:      cubic-bezier(0, 0, 1, 1)               (progress bars, spinners)
```

**Scale** defines four responsive tiers with specific adaptation rules:

```
Small:    320px - 479px    Single column, stacked nav, bottom sheet
Medium:   480px - 1023px   Flexible column, rail nav, side panel
Large:    1024px - 1365px  Multi-column, sidebar nav, inline panel
XLarge:   1366px+          Extended layout, expanded sidebar, canvas
```

### Acrylic and Mica Materials

**Acrylic** is a translucent material that blurs the content directly behind it. It comes in two variants:

- **Background Acrylic:** Blurs content from behind the application window (the desktop, other windows). Used for navigation panes and sidebars. Tint: 80% opacity of the surface color with a Gaussian blur at 30px radius and a noise texture at 2% opacity.
- **In-app Acrylic:** Blurs content within the application (the content area beneath a flyout or command bar). Used for command bars, context menus, and flyouts. Tint: 70% opacity, blur: 20px, noise: 2%.

**Acrylic recipe (CSS for web approximation):**

```css
.acrylic-background {
  background-color: rgba(255, 255, 255, 0.8); /* tint layer */
  backdrop-filter: blur(30px) saturate(125%); /* blur + saturation boost */
}
.acrylic-background::after {
  content: '';
  position: absolute;
  inset: 0;
  background: url('noise.png'); /* 2% noise texture */
  opacity: 0.02;
  pointer-events: none;
}
```

**Mica** is a material unique to Windows 11 that samples the user's desktop wallpaper and creates a subtle, static tint for the app's title bar and background. Unlike Acrylic, Mica does not blur in real-time -- it samples once and applies a static color derived from the wallpaper. This makes it dramatically cheaper to render.

**Mica properties:**

```
Base Mica:       Wallpaper sample at 80% luminance, no blur, very subtle tint
Mica Alt:        Wallpaper sample at 70% luminance, slightly more opaque
Fallback (web):  Solid colorNeutralBackground1 (#FFFFFF light / #292929 dark)
```

**Material selection decision procedure:**

1. Is this a window/title bar background? -> **Mica**
2. Is this a navigation pane behind content? -> **Background Acrylic**
3. Is this a flyout/menu overlaying content? -> **In-app Acrylic**
4. Is the platform unable to composite blur? -> **Solid fallback with noise texture**
5. Has the user enabled "Transparency effects: Off"? -> **Solid fallback, no blur, no noise**

### Connected Animations

Connected animations create visual continuity between views by morphing a shared element from its position in the source view to its position in the destination view.

**The three-phase model:**

1. **Prepare** (0ms): Snapshot the source element's bounds, corner radius, and opacity.
2. **Animate** (300ms, `decelerate` easing): Interpolate position, size, corner radius, and opacity from source to destination.
3. **Complete** (0ms): Hand off rendering to the destination element.

**Concrete example -- file explorer thumbnail (80x80, radius 4px, at position 120,340) morphing to full image preview (1200x800, radius 0px, at 0,0):** All properties -- position, size, corner radius -- interpolate over 300ms with `decelerate` easing. On web, implement using the FLIP technique (First-Last-Invert-Play): snapshot source bounds, position destination, calculate the inverse transform, then animate from inverted to natural position.

### Responsive Containers and Layout

Fluent 2 uses container-based responsive design rather than viewport-based. A `Card` adapts to its container width, not the window width. This means the same Card component works in a full-width layout, a split-view panel, and a Teams tab without media query overrides.

**Container query breakpoints:** Use `container-type: inline-size` on parent elements. Compact (<300px): stack vertically, center actions. Standard (300-599px): row layout with trailing actions. Extended (600px+): grid with metadata column. This replaces viewport media queries entirely.

**Fluent's 4px grid:** All spacing values are multiples of 4px: `XXS: 2px` (icon-to-text), `XS: 4px` (compact padding), `S: 8px` (standard gap), `M: 12px` (card padding), `L: 16px` (section gap), `XL: 20px` (panel margin), `XXL: 24px` (page margin).

### Token Theming Architecture

Fluent 2 tokens follow a three-tier hierarchy: **Global -> Alias -> Component**.

**Brand ramp injection:** You supply 16 shades (shade10 through shade160) spanning L*=5 (darkest) to L*=98 (lightest). Example for a blue brand: shade10 `#020305`, shade40 `#1B2E54`, shade80 `#4F72B8` (primary), shade120 `#B1CCF2`, shade160 `#FAFCFF`.

```

The alias layer maps these brand shades to semantic roles:

```

colorBrandBackground: brand[80] (primary buttons)
colorBrandBackgroundHover: brand[70] (primary hover)
colorBrandBackgroundPressed: brand[40] (primary pressed)
colorBrandForeground1: brand[80] (links, active text)
colorBrandStroke1: brand[80] (focus rings)

```

**Neutral palette (auto-generated):** Fluent generates 28 neutral shades from the brand hue with reduced chroma:

```

colorNeutralBackground1: #FFFFFF (light) / #292929 (dark)
colorNeutralBackground2: #FAFAFA / #1F1F1F
colorNeutralBackground3: #F5F5F5 / #141414
colorNeutralForeground1: #242424 / #FFFFFF
colorNeutralForeground2: #424242 / #D6D6D6
colorNeutralForeground3: #616161 / #ADADAD
colorNeutralStroke1: #D1D1D1 / #404040
colorNeutralStroke2: #E0E0E0 / #333333

````

**Theme application in Fluent UI React v9:**

```jsx
import { FluentProvider, webLightTheme, createLightTheme } from '@fluentui/react-components';

const customTheme = createLightTheme(myBrand);

function App() {
  return (
    <FluentProvider theme={customTheme}>
      <MyApplication />
    </FluentProvider>
  );
}
````

### Anti-Patterns

**Using Acrylic material everywhere.** Acrylic triggers real-time compositor blur which is expensive. Applying Acrylic to scrollable content areas, list items, or the main canvas causes frame drops, especially on integrated GPUs. Acrylic is reserved for commanding surfaces (nav pane, command bar, flyout) -- surfaces that overlay content. Use Mica for window backgrounds and solid colors for content areas.

**Ignoring the transparency effects system setting.** Windows allows users to disable transparency effects (Settings > Personalization > Colors > Transparency effects: Off). When disabled, Acrylic and Mica must fall back to solid colors. If your CSS relies on `backdrop-filter` without a solid fallback, users with transparency off see a fully transparent (invisible) surface. Always provide `background-color` as a base layer beneath `backdrop-filter`.

**Applying reveal highlight to non-interactive elements.** Reveal highlight signals interactivity. Placing it on static text blocks, images, or decorative elements teaches users that the light effect is meaningless, destroying its value as an affordance signal. Only apply reveal to elements that respond to click or tap: buttons, list items, cards with actions, navigation items.

**Using viewport media queries instead of container queries.** A Fluent Card in a Teams side panel at 400px width should render in its compact layout, but a viewport media query at 1920px window width would give it the extended layout. Container queries ensure components adapt to their actual available space, not the window size. This is especially critical in embedded contexts (Teams tabs, SharePoint web parts, Outlook add-ins) where the viewport is not the component's container.

**Flat brand ramp with insufficient contrast spread.** A brand ramp where shade10 through shade160 spans only L*=20 to L*=70 (instead of L*=5 to L*=98) produces alias tokens that fail WCAG AA contrast. `colorBrandForeground1` (brand[80]) on `colorNeutralBackground1` (#FFFFFF) must achieve 4.5:1 contrast. If brand[80] is too light (L\*>55), all branded text becomes illegible. Test the brand ramp extremes against both light and dark neutral backgrounds before deployment.

### Real-World Examples

**Microsoft Teams** is the canonical Fluent 2 implementation. The sidebar uses Background Acrylic (30px blur of the desktop). The chat pane uses `colorNeutralBackground1` (solid). Hover over a message reveals a command bar with In-app Acrylic. The compose box sits at `shadow4` elevation. When switching between chats, message avatars use connected animations -- the avatar morphs from the chat list position to the message header position over 300ms with decelerate easing.

**Windows 11 File Explorer** demonstrates Mica on the title bar and navigation pane header, with the file list on a solid `colorNeutralBackground1`. Folder thumbnails use connected animations when transitioning to the preview pane. Reveal highlight illuminates folder items on hover, with the light effect flowing across adjacent items as the cursor moves through the list.

**Visual Studio Code (Fluent theme)** shows the token theming system at scale: 160+ alias tokens are remapped to match VS Code's syntax highlighting and panel structure. The brand ramp uses VS Code's signature blue (`#007ACC` at brand[80]), generating all interactive states from hover (`brand[70]`: `#0066B8`) to pressed (`brand[40]`: `#003F73`) automatically from the 16-shade ramp.

**Microsoft Loop** uses container-responsive layouts throughout. A Loop component embedded in a Teams message at 280px width renders in compact mode (stacked, minimal chrome). The same component in a full Loop page at 900px renders in extended mode (multi-column, full toolbar). Container queries drive all layout shifts, making the components truly portable across Microsoft 365 hosts.

## Source

Microsoft Fluent 2 Design System (fluent2.microsoft.design, 2024). Fluent UI React v9 documentation (react.fluentui.dev). Windows App SDK design guidelines. MSDN documentation on Acrylic, Mica, and connected animations. WinUI 3 Gallery app source code.

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
