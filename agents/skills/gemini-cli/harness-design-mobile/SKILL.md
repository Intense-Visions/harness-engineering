# Harness Design Mobile

> Token-bound mobile component generation. Scaffold from design tokens and aesthetic intent, implement with React Native, SwiftUI, Flutter, or Compose patterns following platform-specific design rules, and verify every value references the token set with native convention compliance.

## When to Use

- Generating new mobile components that must conform to the project's design system tokens
- When `on_new_feature` triggers fire with mobile UI scope requiring token-bound component generation
- When `on_commit` triggers fire and new mobile components contain hardcoded design values that should reference tokens
- Implementing design intent from `design-system/DESIGN.md` into platform-native styling (StyleSheet, SwiftUI modifiers, Flutter ThemeData, Compose MaterialTheme)
- Ensuring components follow platform-specific guidelines (iOS Human Interface Guidelines, Material Design 3, Flutter design patterns)
- NOT for generating design tokens themselves (use harness-design-system)
- NOT for establishing aesthetic direction or anti-patterns (use harness-design)
- NOT for accessibility auditing (use harness-accessibility)
- NOT for web platform components (use harness-design-web)

## Process

### Phase 1: SCAFFOLD — Read Tokens, Detect Platform, Plan Structure

1. **Read design tokens.** Load `design-system/tokens.json` (W3C DTCG format). Extract:
   - Color tokens: primary, secondary, accent, neutral ramps, semantic colors
   - Typography tokens: heading and body font families, font weights, font sizes, line heights
   - Spacing tokens: spacing scale values
   - If `design-system/tokens.json` does not exist, stop and instruct the user to run `harness-design-system` first.

2. **Read design intent.** Load `design-system/DESIGN.md` for:
   - Aesthetic direction (style, tone, differentiator)
   - Anti-patterns to avoid
   - Platform-specific mobile notes (touch targets, native component usage, platform conventions)
   - If `design-system/DESIGN.md` does not exist, warn the user and proceed with tokens only.

3. **Check harness configuration.** Read `harness.config.json` for:
   - `design.strictness` — enforcement level. Default to `standard`.
   - `design.platforms` — confirm `mobile` is in the platforms list.

4. **Detect mobile platform.** Scan the project for:
   - **React Native:** `package.json` contains `react-native` or `expo`, `.tsx` files with `StyleSheet` or `react-native` imports
   - **SwiftUI:** `.swift` files with `import SwiftUI`, `Package.swift` or `.xcodeproj` exists
   - **Flutter:** `pubspec.yaml` exists, `.dart` files with `import 'package:flutter/`
   - **Compose:** `build.gradle.kts` with `compose` dependencies, `.kt` files with `@Composable`
   - If the user specified `--platform`, use that override.

5. **Load platform-specific rules.** Based on detected platform, read platform design guidelines from `agents/skills/shared/design-knowledge/platform-rules/`:
   - **iOS (SwiftUI/React Native on iOS):** Read `ios.yaml` — Human Interface Guidelines, safe area insets, navigation bar patterns, tab bar conventions, dynamic type support, SF Symbols integration
   - **Android (Compose/React Native on Android):** Read `android.yaml` — Material Design 3, elevation system, shape system, dynamic color, navigation patterns, edge-to-edge layout
   - **Flutter:** Read `flutter.yaml` — Flutter design patterns, ThemeData structure, widget composition, adaptive layouts, platform channel considerations
   - **React Native cross-platform:** Read both `ios.yaml` and `android.yaml` — platform-specific overrides via `Platform.select`, safe area handling, navigation library patterns

6. **Load anti-pattern definitions.** Read anti-pattern files from `agents/skills/shared/design-knowledge/anti-patterns/`:
   - `typography.yaml` — typographic anti-patterns (too many fonts, inconsistent scales)
   - `color.yaml` — color anti-patterns (hardcoded hex, insufficient contrast)
   - `layout.yaml` — layout anti-patterns (magic numbers, inconsistent spacing)
   - `motion.yaml` — motion anti-patterns (excessive animation, missing reduced-motion)

7. **Build token-to-platform mapping.** Create a lookup table mapping tokens to platform-native representations:
   - **React Native:** `color.primary.500` maps to `StyleSheet` value or themed constant
   - **SwiftUI:** `color.primary.500` maps to `Color("primary500")` in asset catalog or `Color(hex:)` extension
   - **Flutter:** `color.primary.500` maps to `Theme.of(context).colorScheme.primary` or custom `AppColors.primary500`
   - **Compose:** `color.primary.500` maps to `MaterialTheme.colorScheme.primary` or custom `AppTheme.colors.primary500`

8. **Plan component structure.** Define:
   - Component file path(s) following platform conventions
   - Props/parameters interface
   - Which tokens will be consumed
   - Platform-specific considerations (safe areas, touch targets, dynamic type)
   - Present plan to user before proceeding.

### Phase 2: IMPLEMENT — Generate Token-Bound Mobile Components

1. **Generate platform-specific component code.** Based on detected platform:

   **React Native (TypeScript):**
   - Functional component with TypeScript props interface
   - All colors via themed StyleSheet or token constants (no hardcoded hex values)
   - Typography via scaled text styles referencing token font families and sizes
   - Spacing via token-derived constants in StyleSheet
   - Platform-specific overrides via `Platform.select` where iOS and Android differ
   - Safe area handling via `useSafeAreaInsets` for edge-to-edge content

   **SwiftUI:**
   - View struct with typed properties
   - Colors from asset catalog or Color extension referencing tokens
   - Typography via custom `Font` extensions mapping to token values
   - Spacing via token-derived constants
   - Dynamic Type support via `.font(.body)` or custom scaled fonts
   - Safe area respect via `.safeAreaInset` modifiers
   - iOS Human Interface Guidelines compliance (44pt minimum touch targets)

   **Flutter (Dart):**
   - StatelessWidget or StatefulWidget with typed constructor parameters
   - Colors via `Theme.of(context)` or custom `AppColors` class referencing tokens
   - Typography via `Theme.of(context).textTheme` or custom `AppTypography`
   - Spacing via token-derived constants class
   - Material Design 3 compliance (elevation, shape, dynamic color)
   - Adaptive layout via `LayoutBuilder` or `MediaQuery` for responsive behavior

   **Compose (Kotlin):**
   - `@Composable` function with typed parameters
   - Colors via `MaterialTheme.colorScheme` or custom theme referencing tokens
   - Typography via `MaterialTheme.typography` or custom type scale
   - Spacing via token-derived `Dp` constants
   - Material Design 3 compliance (Surface, ElevatedCard, shape system)
   - Modifier chains for layout following Compose conventions

2. **Apply platform-specific rules:**
   - **Touch targets:** Minimum 44x44pt (iOS) or 48x48dp (Android/Material)
   - **Safe areas:** All platforms handle notch/status bar/navigation bar correctly
   - **Typography scaling:** Support dynamic type (iOS), font scale (Android), and text scale factor (Flutter)
   - **Elevation/shadows:** Platform-appropriate (iOS shadow, Material elevation, Flutter elevation)
   - **Navigation patterns:** Platform-native navigation (UINavigationController, NavHost, Navigator)

3. **Add USES_TOKEN annotations.** Insert platform-appropriate comments documenting token consumption:
   ```
   // @design-token color.primary.500 — primary action background
   // @design-token typography.heading.fontFamily — section heading
   // @design-token spacing.md — card internal padding
   ```

### Phase 3: VERIFY — Check Token Binding and Platform Compliance

1. **Scan for hardcoded values.** Search generated files for:
   - Hardcoded color values: hex codes, `UIColor(red:green:blue:)`, `Color(0xFF...)`, `Color(red:green:blue:)`
   - Hardcoded font families: string literals for font names not referencing tokens
   - Hardcoded spacing: raw numeric values in padding/margin not from the token scale

2. **Verify token coverage.** For every design value in generated components:
   - Confirm it resolves to a token in `design-system/tokens.json`
   - Confirm the token path is valid
   - Report orphan references

3. **Check platform guideline compliance:**
   - **iOS:** Touch targets >= 44pt, safe area respected, dynamic type supported
   - **Android/Material:** Touch targets >= 48dp, edge-to-edge layout, Material 3 components used
   - **Flutter:** ThemeData used consistently, no hardcoded Material values
   - **React Native:** Platform.select used for iOS/Android differences, safe area handled

4. **Check anti-pattern compliance.** Cross-reference against `design-system/DESIGN.md` anti-patterns and definitions in `agents/skills/shared/design-knowledge/anti-patterns/`.

5. **Query the knowledge graph.** If available at `.harness/graph/`:
   - Verify `DesignToken` nodes exist for all referenced tokens
   - Verify `PLATFORM_BINDING` edges exist for the target mobile platform
   - Check `VIOLATES_DESIGN` edges via `DesignConstraintAdapter`

6. **Assign severity based on `designStrictness`:**
   - `permissive` — all findings are `info`
   - `standard` — hardcoded values are `warn`, platform guideline violations are `warn`, accessibility violations are `error`
   - `strict` — hardcoded values are `error` (blocks), platform violations are `warn`, accessibility violations are `error`

7. **Report verification results:**

   ```
   MOBILE-001 [warn] Hardcoded color Color(0xFF3B82F6) — should reference token
     File: lib/widgets/action_button.dart:15
     Fix: Use Theme.of(context).colorScheme.primary or AppColors.primary500

   MOBILE-002 [warn] Touch target 32dp below minimum 48dp (Material Design 3)
     File: lib/widgets/icon_action.dart:22
     Fix: Set minimumSize to Size(48, 48) in ButtonStyle

   MOBILE-003 [info] Missing dynamic type support
     File: Sources/Views/ProductCard.swift:18
     Fix: Use .font(.body) instead of .font(.system(size: 16))
   ```

8. **Run `harness validate`.** Confirm new components integrate cleanly.

## Harness Integration

- **`harness validate`** — Run after generating components to verify project health.
- **`harness scan`** — Run after component generation to update the knowledge graph with `USES_TOKEN` and `PLATFORM_BINDING` edges.
- **`DesignIngestor`** (`packages/graph/src/ingest/DesignIngestor.ts`) — Verifies `DesignToken` nodes exist for all tokens referenced by generated components.
- **`DesignConstraintAdapter`** (`packages/graph/src/constraints/DesignConstraintAdapter.ts`) — Checks for `VIOLATES_DESIGN` edges during VERIFY phase. Reports constraint violations at configured strictness.
- **`harness-design-system`** — Dependency. Provides `design-system/tokens.json`. If tokens do not exist, instruct user to run harness-design-system first.
- **`harness-design`** — Dependency. Provides `design-system/DESIGN.md` with aesthetic intent and anti-patterns.
- **`harness-impact-analysis`** — Traces token changes to affected mobile components via `USES_TOKEN` edges.

## Success Criteria

- Generated mobile components reference design tokens exclusively — no hardcoded color, font, or spacing values
- Platform detection correctly identifies React Native, SwiftUI, Flutter, or Compose projects
- Token-to-platform mapping produces correct output for each mobile platform
- Platform-specific rules are enforced (touch targets, safe areas, dynamic type, Material 3 compliance)
- `@design-token` annotations are present for every consumed token
- Anti-pattern compliance check catches violations from `design-system/DESIGN.md`
- Verification report uses severity levels matching `design.strictness` configuration
- `harness validate` passes after component generation

## Examples

### Example: React Native Card Component

**Context:** Fitness app. React Native with Expo. Tokens from harness-design-system. Design intent: expressive, warm tone.

**SCAFFOLD output:**

```
Platform detected:  React Native (Expo)
Tokens loaded:      38 tokens from design-system/tokens.json
Design intent:      Expressive, warm (from DESIGN.md)
Component plan:     WorkoutCard with progress indicator
Token consumption:  color.primary.*, color.accent.*, typography.heading, spacing.md/lg
Platform rules:     iOS 44pt touch targets, Android 48dp touch targets, safe area insets
```

**IMPLEMENT output (WorkoutCard.tsx):**

```tsx
// @design-token color.primary.500 — card accent
// @design-token color.neutral.50 — card background
// @design-token color.neutral.900 — primary text
// @design-token typography.heading.fontFamily — workout title
// @design-token typography.body.fontFamily — workout details
// @design-token spacing.md — card padding
// @design-token spacing.sm — content gap

import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '@/theme/tokens';

interface WorkoutCardProps {
  title: string;
  duration: string;
  progress: number;
}

export function WorkoutCard({ title, duration, progress }: WorkoutCardProps) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.detail}>{duration}</Text>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: tokens.color.neutral[50],
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    gap: tokens.spacing.sm,
    ...Platform.select({
      ios: {
        shadowColor: tokens.color.neutral[900],
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  title: {
    fontFamily: tokens.typography.heading.fontFamily,
    fontWeight: tokens.typography.heading.fontWeight,
    fontSize: 18,
    color: tokens.color.neutral[900],
  },
  detail: {
    fontFamily: tokens.typography.body.fontFamily,
    fontSize: 14,
    color: tokens.color.neutral[600],
  },
  progressTrack: {
    height: 6,
    backgroundColor: tokens.color.neutral[200],
    borderRadius: 3,
  },
  progressFill: {
    height: 6,
    backgroundColor: tokens.color.primary[500],
    borderRadius: 3,
  },
});
```

### Example: SwiftUI List Item

**IMPLEMENT output (WorkoutRow.swift):**

```swift
// @design-token color.primary.500 — accent color
// @design-token color.neutral.900 — primary text
// @design-token color.neutral.600 — secondary text
// @design-token typography.heading.fontWeight — title weight
// @design-token spacing.sm — content spacing

import SwiftUI

struct WorkoutRow: View {
    let title: String
    let duration: String
    let progress: Double

    var body: some View {
        VStack(alignment: .leading, spacing: AppSpacing.sm) {
            Text(title)
                .font(.headline)
                .foregroundColor(AppColors.neutral900)

            Text(duration)
                .font(.subheadline)
                .foregroundColor(AppColors.neutral600)

            ProgressView(value: progress)
                .tint(AppColors.primary500)
        }
        .padding(AppSpacing.md)
        .accessibilityElement(children: .combine)
    }
}
```

## Gates

- **No component generation without reading tokens from harness-design-system.** The SCAFFOLD phase requires `design-system/tokens.json`. Do not generate components with hardcoded values as a fallback.
- **No hardcoded design values in generated output.** Every color, font, and spacing value must reference a token.
- **No platform-specific code without platform detection.** The SCAFFOLD phase must detect or receive the target mobile platform before generating components.
- **No generation without scaffold plan confirmation.** Present the component plan to the user first.
- **No iOS components without 44pt minimum touch targets.** Touch target violations are `error` severity regardless of strictness level.
- **No Android/Material components without 48dp minimum touch targets.** Same as iOS — touch targets are non-negotiable.
- **No graph mutations without validating node types.** Verify edge types are registered before writing.

## Escalation

- **When `design-system/tokens.json` does not exist:** Instruct the user: "Design tokens have not been generated. Run `harness-design-system` first, then re-run `harness-design-mobile`."
- **When the project targets multiple mobile platforms:** Generate for the primary platform first, then offer to generate platform-adapted variants. React Native projects get both iOS and Android considerations in a single pass.
- **When tokens are insufficient for the requested component:** Report missing tokens and instruct the user to add them via harness-design-system.
- **When platform guidelines conflict with design intent:** Present the conflict: "Material Design 3 recommends rounded corners for cards, but your design intent declares 'sharp edges only.' Options: (1) Follow platform guidelines for native feel, (2) Override with design intent for brand consistency."
- **When the knowledge graph is unavailable:** Skip graph operations. Log: "Graph not available — skipping token node verification and PLATFORM_BINDING edge creation. Run `harness scan` later to populate."
