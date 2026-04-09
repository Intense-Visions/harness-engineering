# Apple Human Interface Guidelines

> Apple's design philosophy covering clarity/deference/depth, vibrancy and material effects, SF Symbols integration, semantic color system, safe area management, and platform-specific navigation patterns across iOS, iPadOS, macOS, watchOS, and visionOS.

## When to Use

- Building native Apple platform apps where adherence to HIG conventions affects App Store review outcomes
- Implementing a SwiftUI or UIKit component library that must integrate with system-provided materials, vibrancy, and semantic colors
- Designing navigation architecture for an app targeting multiple Apple platforms (iPhone, iPad, Mac Catalyst, visionOS)
- Handling safe areas for devices with notches, Dynamic Island, home indicators, and rounded display corners
- Choosing SF Symbols and configuring their rendering modes, weight matching, and variable color behavior

## Instructions

Apple's HIG is organized around three foundational principles: **clarity** (text is legible at every size, icons are precise, adornments are subtle), **deference** (content is the focus, UI chrome recedes through materials and vibrancy), and **depth** (visual layers and transitions convey hierarchy and position). Unlike Material Design's generative token system, Apple's design language relies on semantic system resources that adapt automatically to appearance (light/dark), accessibility settings (increased contrast, reduced transparency), and device context.

**Key architectural rule:** Never hardcode colors, font sizes, or layout constants. Apple provides semantic resources (`UIColor.systemBackground`, `Font.body`, `safeAreaInsets`) that automatically adapt. Hardcoding `#FFFFFF` for a background means your app breaks in Dark Mode, ignores Increased Contrast, and fails to adapt to platform-specific surface tints.

**Platform divergence is intentional.** A `NavigationSplitView` on iPhone shows a single column with push navigation. On iPad, it shows two or three columns. On Mac, it adds a toolbar. The same semantic component renders differently per platform. Designing for Apple means designing for adaptive presentation, not fixed layouts.

## Details

### Clarity, Deference, and Depth

**Clarity** dictates that every element serves a communicative purpose. Apply the San Francisco (SF Pro) system font at Dynamic Type sizes, not arbitrary point values. SF Pro's optical sizes adjust weight and spacing automatically: at 20pt, SF Pro uses wider letter-spacing than at 11pt, ensuring legibility without manual kerning.

**Dynamic Type scale (default sizes, not accessibility sizes):**

```
.largeTitle     34pt   weight: regular
.title1         28pt   weight: regular
.title2         22pt   weight: regular
.title3         20pt   weight: regular
.headline       17pt   weight: semibold
.body           17pt   weight: regular
.callout        16pt   weight: regular
.subheadline    15pt   weight: regular
.footnote       13pt   weight: regular
.caption1       12pt   weight: regular
.caption2       11pt   weight: regular
```

When the user increases Dynamic Type to AX5 (the largest accessibility size), `.body` scales from 17pt to 53pt. Your layout must accommodate this without truncation. Use `ScrollView` instead of fixed-height containers for text regions.

**Deference** means the UI fades behind content. Apple achieves this through materials -- translucent layers that blur and tint the content behind them. A navigation bar in iOS uses `.regularMaterial` (or `.bar` in UIKit), not an opaque color. The material samples the colors beneath it, creating a contextual background that shifts as the user scrolls.

**Depth** uses layering with distinct z-planes. iOS defines three depth planes: the base content, a raised overlay (sheets, popovers), and an alert level (alerts, action sheets). Each plane has its own material weight: base uses `.systemBackground`, overlays use `.systemGroupedBackground` or `.secondarySystemBackground`, and alerts use `.thickMaterial` for maximum separation.

### Vibrancy and Materials

Materials are translucent layers defined by their blur radius, saturation, and tint. Apple provides five material weights:

```
.ultraThinMaterial    Minimal blur, maximum transparency    (widgets)
.thinMaterial         Light blur, high transparency          (inactive overlays)
.regularMaterial      Balanced blur and tint                 (navigation bars, tab bars)
.thickMaterial        Heavy blur, reduced transparency       (alerts, action sheets)
.ultraThickMaterial   Maximum blur, minimal transparency     (full-screen overlays)
```

**Vibrancy** is a label rendering mode that makes text and icons vibrant against material backgrounds. It amplifies the luminance of content placed on translucent materials so text remains legible regardless of what is behind the blur.

Three vibrancy levels exist:

```
.primary              Full vibrancy    (titles, primary labels)
.secondary            Muted vibrancy   (subtitles, secondary text)
.tertiary             Faint vibrancy   (disabled text, placeholders)
```

**Concrete implementation in SwiftUI:**

```swift
ZStack {
    Image("background")
        .resizable()
    VStack {
        Text("Title")
            .foregroundStyle(.primary)    // vibrant white/black
        Text("Subtitle")
            .foregroundStyle(.secondary)  // muted vibrancy
    }
    .padding()
    .background(.regularMaterial)
}
```

**Fallback in Increased Contrast mode:** When the user enables "Increase Contrast" in Accessibility settings, materials become opaque. `.regularMaterial` renders as solid `systemBackground` with no blur. Your layout must not depend on seeing content through the material -- all essential information must be on the foreground layer.

### SF Symbols

SF Symbols is a library of 5,000+ vector icons designed to align with SF Pro text. Every symbol has 9 weights (ultralight through black) and 3 scales (small, medium, large) that automatically match the surrounding text.

**Rendering modes:**

```
.monochrome        Single color, inherits foreground       (toolbar icons)
.hierarchical      Single tint, automatic opacity layers   (multi-part icons)
.palette           2-3 explicit colors you assign          (tab bar, badges)
.multicolor        Fixed colors defined by Apple           (weather, file types)
```

**Weight matching rule:** An SF Symbol adjacent to `.body` text (regular weight) renders at regular weight. Adjacent to `.headline` (semibold) it renders semibold. This matching is automatic in SwiftUI when using `Label("Text", systemImage: "icon.name")`. Manual `Image(systemName:)` requires explicit `.fontWeight()` to match.

**Variable color:** Some symbols support continuous fill levels (0.0 to 1.0). `speaker.wave.3` at value 0.33 fills one wave, at 0.66 fills two, at 1.0 fills all three. This enables smooth animations for volume, signal strength, and progress.

```swift
Image(systemName: "wifi", variableValue: signalStrength)
    .symbolRenderingMode(.hierarchical)
    .foregroundStyle(.blue)
```

**Custom symbol creation:** Export from SF Symbols app as SVG template. The template defines 3 layers (background, base, accent) and 9 weight variants. Each weight variant must be a distinct path -- interpolation between weights is not supported for custom symbols.

### Semantic Colors

Apple defines colors by purpose, not value. The exact hex value changes across platform, appearance, and accessibility setting.

**System background colors (light / dark / increased contrast dark):**

```
.systemBackground              #FFFFFF / #000000 / #000000
.secondarySystemBackground     #F2F2F7 / #1C1C1E / #2C2C2E
.tertiarySystemBackground      #FFFFFF / #2C2C2E / #3A3A3C
```

**System content colors:**

```
.label                         #000000 / #FFFFFF
.secondaryLabel                #3C3C43 at 60% / #EBEBF5 at 60%
.tertiaryLabel                 #3C3C43 at 30% / #EBEBF5 at 30%
.quaternaryLabel               #3C3C43 at 18% / #EBEBF5 at 18%
```

**Tint colors** are the seven system-provided accent colors:

```
.systemRed       #FF3B30 / #FF453A
.systemOrange    #FF9500 / #FF9F0A
.systemYellow    #FFCC00 / #FFD60A
.systemGreen     #34C759 / #30D158
.systemBlue      #007AFF / #0A84FF
.systemIndigo    #5856D6 / #5E5CE6
.systemPurple    #AF52DE / #BF5AF2
```

Dark mode tint variants are slightly brighter (higher luminance) than their light mode equivalents. `systemBlue` shifts from `#007AFF` (L*=48) to `#0A84FF` (L*=53) to maintain the same perceived contrast against a dark background.

**Platform differences:** macOS `systemBackground` resolves to `#ECECEC` (a warm gray), not `#FFFFFF`. macOS windows have distinct content backgrounds (`windowBackgroundColor`) that differ from iOS backgrounds. Never assume cross-platform color parity.

### Safe Areas

Safe areas define the region of the screen guaranteed to be unobstructed by hardware (notch, Dynamic Island, rounded corners, home indicator) and system UI (status bar, navigation bar, tab bar).

**iPhone 15 Pro safe area insets:**

```
Top:      59pt   (status bar + Dynamic Island)
Bottom:   34pt   (home indicator)
Leading:  0pt
Trailing: 0pt
```

**iPad Pro 12.9" safe area insets (no hardware obstructions):**

```
Top:      24pt   (status bar only)
Bottom:   20pt   (home indicator)
Leading:  0pt
Trailing: 0pt
```

**Keyboard safe area:** When the keyboard appears, `safeAreaInset(edge: .bottom)` expands to include the keyboard height (~336pt on iPhone). Use `.safeAreaInset(edge: .bottom)` in SwiftUI or `keyboardLayoutGuide` in UIKit to push content above the keyboard.

**When to ignore safe areas:** Full-bleed images and backgrounds should extend into the unsafe region using `.ignoresSafeArea()`. Content (text, buttons, interactive elements) must never extend into unsafe areas. A common pattern: background ignores safe area, content respects it.

```swift
ZStack {
    Color.blue.ignoresSafeArea()        // extends behind notch
    VStack {
        Text("Content stays safe")       // respects safe area
    }
}
```

### Platform-Specific Navigation

**iPhone:** `NavigationStack` with push/pop. Tab bar at bottom (maximum 5 tabs). No visible back button label on small screens -- the chevron and swipe-back gesture suffice.

**iPad:** `NavigationSplitView` with 2 or 3 columns. Sidebar collapses in compact width. Tab bar transforms into a sidebar in iPadOS 18+. Popovers replace action sheets.

**Mac (Catalyst / native):** `NavigationSplitView` with toolbar. Menu bar integration. Window resizing. `Settings` scene replaces the iOS settings bundle. Hover states on all interactive elements -- mandatory because Mac has a cursor.

**visionOS:** Ornaments replace toolbars. Content floats in a window at `z: 0`. Modals push to `z: 50pt` depth. Navigation uses tab bars rendered as ornaments below the window. Eye tracking drives hover states -- interactive targets minimum 60pt diameter (larger than iOS 44pt) because eye fixation is less precise than finger touch.

### Anti-Patterns

**Hardcoding hex colors instead of using semantic system colors.** Setting `background: #F2F2F7` works in light mode but becomes invisible in dark mode. Use `.secondarySystemBackground` which resolves to `#F2F2F7` in light and `#1C1C1E` in dark. This also handles Increased Contrast mode automatically. Hardcoded colors fail four adaptations: light/dark, standard/increased contrast.

**Using fixed font sizes instead of Dynamic Type text styles.** Setting `font-size: 17px` ignores the user's preferred content size. When a visually impaired user sets AX3, your text stays at 17pt while system apps scale to 40pt. Use `.font(.body)` which maps to the user's chosen size. Fixed font sizes can also cause App Store review rejection under accessibility guidelines.

**Placing interactive content in unsafe areas.** A "Skip" button at the absolute top of the screen is obscured by the Dynamic Island on iPhone 15 Pro. A floating action button at the absolute bottom overlaps the home indicator. All interactive elements must be within `safeAreaLayoutGuide`. Background decorations may extend outside; buttons, text fields, and links must not.

**Using opaque navigation bars on scrollable content.** iOS navigation bars use `.regularMaterial` by default -- translucent with blur. Overriding with an opaque background color breaks the deference principle and creates a harsh visual boundary. Users expect to see content scroll behind the bar. The exception is when the bar contains complex content (search fields, segmented controls) where blur would reduce legibility.

**Ignoring platform-specific navigation conventions.** Showing a bottom tab bar on macOS (where the convention is a sidebar or toolbar), or using a hamburger menu on iOS (where tab bars are standard), violates user expectations built from using the platform. Each Apple platform has distinct navigation paradigms. A single navigation approach forced across all platforms signals non-native design.

### Real-World Examples

**Apple Weather** exemplifies deference: the background is a full-screen animated weather condition, and all UI elements sit on materials of varying thickness. The hourly forecast uses `.thinMaterial`, the daily forecast uses `.regularMaterial`, and alert banners use `.thickMaterial`. Each layer's legibility is maintained through vibrancy-rendered text.

**Apple Maps** demonstrates safe area handling across every iPhone variant. The floating search card respects bottom safe area insets, expanding upward. On iPad, the same search card becomes a sidebar panel. On Mac, it transforms into a toolbar search field. One semantic component, three platform presentations.

**Fantastical** uses SF Symbols with variable color for event indicators: a circle symbol at `variableValue: 0.5` indicates a half-day event, `1.0` a full-day event. Their calendar icons match the surrounding text weight automatically, scaling from ultralight in the month header to regular in the day cells.

**Things 3** demonstrates the depth principle: the task list sits at base depth, a new-task sheet slides up at overlay depth with `.regularMaterial`, and a delete confirmation alert appears at alert depth with `.thickMaterial`. Each depth transition uses a spring animation (`response: 0.35, dampingFraction: 0.86`) matching the system default.

## Source

Apple Human Interface Guidelines (developer.apple.com/design/human-interface-guidelines, 2024). Apple Developer Documentation for UIKit and SwiftUI. WWDC sessions: "What's new in SF Symbols" (2023), "Design for spatial computing" (2023), "Get started with Dynamic Type" (2022). Apple Design Resources Figma/Sketch libraries.

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
