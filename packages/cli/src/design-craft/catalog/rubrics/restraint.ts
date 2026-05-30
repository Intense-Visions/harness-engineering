// packages/cli/src/design-craft/catalog/rubrics/restraint.ts
//
// Sixth seed rubric — first of the Phase 2B widen-to-10 pair (C006
// restraint + C007 polish-details). Pairs with the C001/C004 foundational
// large rubrics to ask a different question: not "did you express the
// hierarchy / commit to color roles" but "did you stop adding things once
// the message was carried?". Restraint is the cross-cutting craft virtue
// that high-tier surfaces (Linear, Stripe, Vercel) share and that low-tier
// surfaces (busy SaaS dashboards, decorated marketing pages) lack.
//
// CRAFT-C006 — Restraint. Foundational × large on the addition-discipline
// dimension. Sourced from refactoring-ui#less-is-more + dieter-rams#10-
// principles. The rubric asks whether the surface earns every element it
// shows, or whether ornament, redundancy, and visual noise have
// accumulated past the point of usefulness.
//
// Honors:
//   - ADR 0019: tier × impact × confidence preserved verbatim from the LLM.
//   - ADR 0020: id/version/status/authoredAt/contributors/source.ref required.

import type { RubricDefinition } from './hierarchy-clarity.js';

export const restraintRubric: RubricDefinition = {
  id: 'rubric-restraint',
  name: 'Restraint',
  version: 1,
  status: 'stable',
  authoredAt: '2026-05-30',
  contributors: ['@chadjw'],
  appliesTo: ['component', 'page'],
  source: {
    ref: 'refactoring-ui#less-is-more + dieter-rams#10-principles',
    url: 'https://www.refactoringui.com/',
  },
  prompt: [
    'Evaluate the restraint of {target}.',
    '',
    'Source under review:',
    '```',
    '{source}',
    '```',
    '',
    '- Does every visible element earn its place, or has the surface',
    '  accumulated ornament (gradients, borders, shadows, icons, badges)',
    '  past the point where it adds meaning?',
    '- Is there a single focal action, or do multiple CTAs compete for',
    '  the same attention budget?',
    '- Are decorative flourishes (illustrations, mascots, animated',
    '  backgrounds) earning their cost in cognitive load and load time,',
    '  or are they filler standing in for an unclear message?',
    '- Are containers nested where flat layout would carry the same',
    '  hierarchy (cards-in-cards, panels-in-panels)?',
    '- Are properties repeated where one would do (multiple separators,',
    '  redundant labels, label + icon + tooltip all naming the same thing)?',
    '- Does the surface trust the reader to follow a clear path, or does',
    '  it hand-hold with explainer text, callouts, and arrows pointing at',
    '  things that need no pointing?',
    '',
    'Use the 3-axis output model (tier x impact x confidence). Restraint',
    'reads well from code (counting visible elements, nesting depth,',
    'redundant prop combinations is structural), so confidence here can',
    'be reasonably high even in fast/code-only mode.',
    '',
    'Respond with a single fenced ```json``` block containing an object:',
    '{',
    '  "tier": "foundational" | "polish" | "aspirational",',
    '  "impact": "small" | "medium" | "large",',
    '  "confidence": "high" | "medium" | "low",',
    '  "message": "<one-paragraph critique of what you see>"',
    '}',
  ].join('\n'),
  positiveExample: [
    'Linear command palette — one input, one result list, one keyboard',
    'shortcut footer. No nested cards, no badges decorating each row, no',
    'illustrated empty state competing with the input. The single accent',
    'sits on the selected row and nowhere else. Every pixel is doing work.',
  ].join('\n'),
  negativeExample: [
    'Marketing pricing page with three plan cards, each wrapped in a',
    'rounded container, each container wrapped in a gradient border, each',
    'gradient border wrapped in a drop-shadow panel. Every feature row',
    'gets a checkmark icon, an "info" tooltip trigger, AND an italic',
    'sub-line repeating the row label. Two competing CTAs ("Start free"',
    'and "Talk to sales") sit at equal weight at the bottom of every card.',
  ].join('\n'),
  findingTemplate: {
    code: 'CRAFT-C006',
    tier: 'foundational',
    impact: 'large',
    phase: 'critique',
  },
};
