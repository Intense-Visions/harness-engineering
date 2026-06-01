// packages/cli/src/design-craft/catalog/exemplars/vercel-build-progress.ts
//
// Phase 2 catalog increment — eighth exemplar. Closes the CRAFT-B008
// reservation called out in finding-codes.md (second LoadingState anchor)
// and continues the horizontal-growth phase of the seed begun with
// `notion-empty-database` (CRAFT-B007).
//
// Vercel's deployment / build progress surface is the anchor because it
// is the canonical reference for a NARRATIVE LoadingState — a register
// distinct from Stripe's content-matched skeleton (CRAFT-B002). Where
// Stripe's loading state is preview-led ("here is the shape of what is
// about to appear"), Vercel's is progress-led ("here are the phases the
// system is moving through, here is which one is active, here is the
// live log stream from the active phase"). Both are valid v1 patterns;
// carrying both gives BENCHMARK enough reference variance per
// componentType to score targets against the right register rather than
// collapsing every LoadingState toward the skeleton-shimmer model.
//
// Honors ADR 0020 (living catalog H pattern): provenance + contributors +
// versioning are required so usage signal + growth work.

import type { ExemplarDefinition } from './linear-empty-list.js';

export const vercelBuildProgressExemplar: ExemplarDefinition = {
  id: 'exemplar-vercel-build-progress',
  name: 'Vercel Build Progress',
  componentType: 'LoadingState',
  version: 1,
  status: 'stable',
  url: 'https://vercel.com/docs/deployments/builds',
  authoredAt: '2026-05-31',
  contributors: ['@chadjw'],
  source: {
    ref: 'vercel-app#deployment-builds',
    url: 'https://vercel.com/docs/deployments/managing-deployments',
  },
  critique: [
    'Hierarchy: the named phases ("Queued", "Building", "Deploying",',
    '"Assigning Domains") read first as a horizontal stepper across the',
    'top of the surface — the user can see the full journey at a glance.',
    'The active phase reads second, highlighted with the brand accent and',
    'a small live indicator (pulse dot) so the eye lands on "what is',
    'happening right now." The streaming log tail reads third in the',
    'lower region, monospace, scroll-pinned to the latest line. No two',
    'regions compete for primary attention; each is doing distinct work.',
    'Typography: phase labels in reading weight at a settled size with',
    'tracked-tight letter-spacing; the active phase carries a 1-step',
    'weight increase rather than a color shift, so contrast is preserved',
    'for users with low color discrimination. Log lines in tabular',
    'monospace at reduced size; timestamps left-pinned with tabular',
    'figures so they read as a stable column even as new lines stream in.',
    'Visual: the stepper is a single horizontal rule with phase tokens',
    'sitting on it — completed phases resolve to the brand token at full',
    'saturation, the active phase carries a pulsing accent ring, future',
    'phases sit in a quiet muted tint. No icons, no individual cards per',
    'phase, no painted background behind the stepper. The log region is',
    'a single rounded surface with one border, no banded rows, no',
    'syntax-coloring chrome competing with the prose.',
    'Density: phase labels are spaced for scan-ability (the user',
    'reads them as a journey, not as a list); log lines are dense enough',
    'to scan 12+ at a screen without crowding. The stepper region is',
    'comfortable; the log region is dense. The density change between',
    'regions is intentional — it signals their different roles.',
    'Motion: the active-phase pulse uses a tuned breath cycle (~1.8s,',
    'easing on both ends, no sharp transitions) — it reads as a',
    'heartbeat rather than a spinner. Phase transitions slide the active',
    'indicator across the stepper rail with a tuned spring (~240ms) so',
    'the journey feels continuous, not stepwise. Log lines fade in over',
    '~80ms as they stream — fast enough to not feel staged, slow enough',
    'to not strobe. Reduced-motion respects: pulse degrades to a static',
    'accent ring; line fades degrade to instant appearance.',
    'Interaction: the user can collapse the log region to focus on the',
    'stepper alone; can expand the active log line to view its full',
    'multi-line payload; can cancel the build from a discreet action in',
    'the stepper rail. Focus order follows visual order. The log',
    'auto-scrolls but pauses when the user scrolls up (the standard',
    "tail-but-don't-fight-me pattern). On completion, the stepper",
    'resolves to a single success token; the log region collapses into',
    'a summary card with the canonical "View deployment" CTA. The',
    'loading state ends with a clean handoff to the loaded state — no',
    'jarring flash.',
    'Copy: phase names are noun-verbs naming the work ("Queued",',
    '"Building", "Deploying") — calm, specific, non-marketing. Log lines',
    'are pass-through from the build (no editorial framing). The summary',
    'card on completion names the outcome ("Deployed", "Failed",',
    '"Cancelled") and the canonical recovery path — same calm forensic',
    'register as the Vercel error exemplar (CRAFT-B004).',
  ].join('\n'),
  whyExemplar: [
    'Demonstrates the NARRATIVE LoadingState register most product',
    'loading states miss. Stripe (CRAFT-B002) shows the preview register',
    '(here is the shape of what is about to appear). Vercel shows the',
    'progress register (here are the phases the system is moving',
    'through, here is which one is active, here is the live log from',
    'the active phase). Most competing build / deploy / long-running-',
    'task surfaces collapse both registers into a single centered',
    'spinner with a percentage that lies, missing the multi-phase nature',
    'of the work entirely. The proof points are: (1) the journey is',
    'visible at a glance — the user sees the full set of phases, not',
    'just the active one; (2) the active phase signals "alive" with a',
    'tuned breath rather than a spinner that suggests stuckness; (3) the',
    'log tail is treated as first-class content (a region of its own,',
    'not buried in a dropdown); (4) reduced-motion has a graceful',
    'degradation; (5) the loading state ends with a clean handoff to a',
    'summary card, not a sudden swap. Carrying both Stripe and Vercel as',
    'LoadingState anchors lets BENCHMARK distinguish "this surface wants',
    'the preview register" from "this surface wants the progress',
    'register" rather than scoring every loading state against a single',
    'tonal model. The exemplar composes naturally with `CRAFT-C001`',
    '(hierarchy — three distinct regions, each doing distinct work),',
    '`CRAFT-C003` (motion quality — the breath pulse and reduced-motion',
    'degradation), `CRAFT-C006` (restraint — one rounded log surface, no',
    'painted phase cards), `CRAFT-C008` (copy voice — noun-verb phase',
    'names, pass-through log content), `CRAFT-C009` (interaction craft —',
    'collapsible log, cancel action, tail-but-pause auto-scroll), and',
    '`CRAFT-P003` (stagger-timing — phase transitions sliding across the',
    'stepper rail).',
  ].join('\n'),
  radarReference: {
    philosophicalCoherence: 92,
    hierarchy: 94,
    craftExecution: 93,
    function: 96,
    innovation: 84,
  },
  citationCount: 0,
};
