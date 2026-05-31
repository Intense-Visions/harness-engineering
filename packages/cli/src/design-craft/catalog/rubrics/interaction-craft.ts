// packages/cli/src/design-craft/catalog/rubrics/interaction-craft.ts
//
// Ninth seed rubric — second of the Phase 2C widen-to-10 triple (C008
// copy-voice + C009 interaction-craft + C010 brand-coherence).
//
// CRAFT-C009 — Interaction Craft. Polish × large pair on the
// pointer/keyboard/gesture dimension. Sourced from emil-design-eng#
// interaction + raycast#keyboard-quality + linear#kbd-shortcuts. Where
// the polish-details rubric (C007) asks whether the seams are sanded,
// this rubric asks whether the interaction itself is crafted — does it
// feel like the surface anticipates the input, or does it feel like
// you're typing into a form that doesn't know you're there?
//
// Honors:
//   - ADR 0019: tier × impact × confidence preserved verbatim from the LLM.
//   - ADR 0020: id/version/status/authoredAt/contributors/source.ref required.

import type { RubricDefinition } from './hierarchy-clarity.js';

export const interactionCraftRubric: RubricDefinition = {
  id: 'rubric-interaction-craft',
  name: 'Interaction Craft',
  version: 1,
  status: 'stable',
  authoredAt: '2026-05-30',
  contributors: ['@chadjw'],
  appliesTo: ['component', 'page'],
  source: {
    ref: 'emil-design-eng#interaction + raycast#keyboard-quality',
    url: 'https://github.com/emilkowalski/skill/blob/main/skills/emil-design-eng/SKILL.md',
  },
  prompt: [
    'Evaluate the interaction craft of {target}.',
    '',
    'Source under review:',
    '```',
    '{source}',
    '```',
    '',
    '- Is the keyboard story first-class — is every interactive surface',
    '  reachable, does Enter activate the default action, does Escape',
    '  cancel where it should, do Arrow keys traverse what they should',
    '  traverse — or is the keyboard an afterthought handled only by the',
    '  browser default?',
    '- Are mutations optimistic where the outcome is near-certain (favorite',
    '  toggle, mark-read, rename) so the surface feels responsive, with',
    '  graceful rollback on failure — or does every interaction round-trip',
    '  through a spinner?',
    '- Does the surface anticipate the next input — autofocus on the field',
    '  the user will type next, pre-select the most likely option,',
    '  surface the keyboard shortcut next to the action — or does the',
    '  user navigate every step manually?',
    '- Are hover / active / pressed states distinct from focus and from',
    '  each other, with motion that maps to the gesture (settle on',
    '  release, lift on hover) rather than a single instant color swap?',
    '- Are destructive actions guarded with the right friction — confirm',
    '  for irreversible, undo banner for reversible, immediate for trivial',
    '  — or is every destructive action gated by a modal regardless of',
    '  blast radius?',
    '- Does the surface handle the in-between states gracefully —',
    '  pending, partial-success, retry-in-progress — or does it show only',
    '  success and failure?',
    '',
    'Use the 3-axis output model (tier x impact x confidence). Some',
    'interaction craft reads from code (keyDown handlers, autoFocus,',
    'aria-*) but much of it (hover-to-press timing, optimistic UI feel,',
    'gesture mapping) needs rendering. Confidence should drop on the',
    'latter in fast/code-only mode.',
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
    'Raycast command palette — every action ships with its shortcut',
    'rendered to the right of the row; Enter activates, Escape closes,',
    'Arrow keys traverse, Tab cycles sections. Favorite toggle is',
    'optimistic with an inline rollback on failure. The text field',
    'autofocuses on open; the most recent command pre-selects. Hover',
    'lifts the row a hair; press settles it; release runs the action.',
  ].join('\n'),
  negativeExample: [
    'Settings dialog where the "Delete account" button opens a modal',
    'with another "Delete account" button that opens another confirm',
    'with a checkbox; Tab traversal skips the cancel button; Escape does',
    'nothing; Enter on the username field submits the form even though',
    'the user is mid-edit. Every save action shows a 500ms spinner even',
    'when the change is local-only. No keyboard shortcuts anywhere.',
  ].join('\n'),
  findingTemplate: {
    code: 'CRAFT-C009',
    tier: 'polish',
    impact: 'large',
    phase: 'critique',
  },
};
