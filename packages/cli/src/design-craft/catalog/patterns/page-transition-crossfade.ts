// packages/cli/src/design-craft/catalog/patterns/page-transition-crossfade.ts
//
// Phase 2 catalog increment — fourth polish pattern. Closes the v1
// motion sub-category (3 motion patterns: spring-physics, stagger-timing,
// page-transition-crossfade) per success criterion #8.
//
// CRAFT-P004. Exercises a fourth tier × impact combination
// (foundational × medium) — the first foundational-tier polish pattern in
// the seed. Crossfade-on-route-change is structural rather than elevating:
// without it, route changes feel like full reloads even on a SPA, so the
// rubric reads as a baseline craft floor, not a finishing move.
//
// Honors ADR 0020 (living catalog H pattern): id/version/status/authoredAt/
// contributors/source are required so growth signal + provenance work.

import type { PatternDefinition } from './spring-physics.js';

/**
 * Pattern: Page Transition Crossfade.
 *
 * Adds a brief opacity crossfade (~120ms in, ~80ms out, with the in starting
 * after the out completes) on route changes. The eye reads the transition
 * as a "soft cut" rather than a jarring swap, and the small temporal anchor
 * makes the SPA feel like a continuous surface instead of a series of
 * disconnected pages.
 *
 * Tier: foundational — the absence of this transition is felt as a craft
 * defect (the SPA feels "snappy" but cheap). Impact: medium — pages with
 * already-strong loading states feel the difference less than pages that
 * rely on a hard render swap.
 */
export const pageTransitionCrossfadePattern: PatternDefinition = {
  id: 'pattern-page-transition-crossfade',
  name: 'Page Transition Crossfade',
  version: 1,
  status: 'stable',
  authoredAt: '2026-05-31',
  contributors: ['@chadjw'],
  source: {
    ref: 'vercel-geist#page-transition',
    url: 'https://vercel.com/geist/motion',
  },
  applicableTo: [
    { kind: 'jsx-pattern', match: 'AnimatePresence' },
    { kind: 'identifier', match: 'usePathname' },
    { kind: 'identifier', match: 'useRouter' },
    { kind: 'css-property', match: 'view-transition-name' },
  ],
  when: [
    'Route changes swap the current page for the next with no visual',
    'continuity. The eye reads the change as a hard reload — even on a',
    'SPA — because the only signal is "old DOM gone, new DOM here." This',
    'breaks the illusion that the user is navigating one continuous',
    'surface and makes the product feel like a stack of disconnected',
    'pages.',
  ].join('\n'),
  suggest: [
    'Wrap the route outlet in a brief opacity crossfade. Recommended',
    'timing:',
    '  - Outgoing page: ~80ms fade-out, ease-out',
    '  - Incoming page: ~120ms fade-in, ease-out, starting after the',
    '    outgoing fade resolves (total transition budget ~200ms)',
    'Pair with the native CSS view-transitions API where browser support',
    'allows; fall back to AnimatePresence (framer-motion) or a CSS',
    'class-swap with a transition.',
    'Always pair with `prefers-reduced-motion`: skip the fade and swap',
    'instantly when the user has motion-sensitivity preferences set.',
    'Avoid combining the crossfade with simultaneous content motion',
    '(stagger, spring entrances) on the incoming page — the crossfade',
    'is the route signal; content-level motion comes after.',
  ].join('\n'),
  before: [
    '// Next.js app router — Layout.tsx (no transition between routes)',
    'export default function Layout({ children }: { children: ReactNode }) {',
    '  return <main>{children}</main>;',
    '}',
  ].join('\n'),
  after: [
    '// Using framer-motion AnimatePresence + the route pathname as key',
    "import { AnimatePresence, motion } from 'framer-motion';",
    "import { usePathname } from 'next/navigation';",
    '',
    'export default function Layout({ children }: { children: ReactNode }) {',
    '  const pathname = usePathname();',
    '  return (',
    '    <AnimatePresence mode="wait" initial={false}>',
    '      <motion.main',
    '        key={pathname}',
    '        initial={{ opacity: 0 }}',
    '        animate={{ opacity: 1 }}',
    '        exit={{ opacity: 0 }}',
    "        transition={{ duration: 0.12, ease: 'easeOut' }}",
    '      >',
    '        {children}',
    '      </motion.main>',
    '    </AnimatePresence>',
    '  );',
    '}',
  ].join('\n'),
  findingTemplate: {
    code: 'CRAFT-P004',
    tier: 'foundational',
    impact: 'medium',
    phase: 'polish',
  },
};
