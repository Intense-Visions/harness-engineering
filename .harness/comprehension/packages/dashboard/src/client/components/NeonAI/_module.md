---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/NeonAI'
sourceHash: '1ede991887997ff1c984b7f937e72c9fec3b984d4341b0e1f53b484fd259de53'
compiledAt: '2026-08-28T01:22:11.175Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['AuraBackground.tsx', 'GlowCard.tsx', 'Sigil.tsx']
---

## Summary

The `NeonAI` module exports three interconnected visual components that create a deep-sea bioluminescent design language. **AuraBackground** is a fixed z-negative backdrop with mouse-tracked parallax glows and CSS-animated plankton particles; it transitions from cool blues to warm ambers based on system stress level via `useProjectPulse`. **GlowCard** wraps content with a mouse-following spotlight effect and tactical corner markers for data-viz aesthetics. **Sigil** is a small animated bioluminescent identity logo with periodic brightness flares and reduced-motion respect. All three compose into a unified aquatic visual metaphor—calm when healthy, warning-tinted under stress.

## Invariants

- AuraBackground must be mounted at viewport root — it's fixed inset-0 -z-10 and breaks if inside a scrollable or positioned parent
- The .plankton CSS class must define drift animations — particles are purely DOM with CSS custom properties (--drift-x, --drift-y, --drift-duration, --drift-delay); no class means no motion
- Spring physics config (damping: 50, stiffness: 100) is tuned — parallax lag/responsiveness depend on these exact values
- Three-layer parallax ranges are interdependent — moveX/moveY use [20, -20], moveXDeep use [40, -40], moveXAbyss use [10, -10]; misaligned ranges collapse depth cues
- Plankton count is exactly 85 — visual density and scale are balanced to this particle count
- Color scheme is hardcoded for dark theme — background assumes navy/black base; light backgrounds break appearance
- useProjectPulse must provide numeric pulse.stressLevel (0–1) — color transitions and stress overlay depend on this property
- GlowCard's spotlight requires synchronous MouseEvent handling — onMouseMove must complete within motion-template rendering cycle or spotlight lags
- Sigil's hue is randomly seeded once on mount and never re-rolled — useMemo assumes prefers-reduced-motion is static

## Interface Contract

```ts
export AuraBackground
export GlowCard
export Sigil
```

## Dependency Slice

```
import { useProjectPulse } from '../../hooks/useProjectPulse'
import { motion, useMotionTemplate, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion'
import { MouseEvent, ReactNode, useEffect, useMemo } from 'react'
```
