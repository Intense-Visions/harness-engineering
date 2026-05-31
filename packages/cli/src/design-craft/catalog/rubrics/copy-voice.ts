// packages/cli/src/design-craft/catalog/rubrics/copy-voice.ts
//
// Eighth seed rubric — first of the Phase 2C widen-to-10 triple (C008
// copy-voice + C009 interaction-craft + C010 brand-coherence). Closes
// SC #7 (10 critique rubrics in the v1 seed).
//
// CRAFT-C008 — Copy Voice. Polish × medium pair on the prose-in-UI
// dimension. Sourced from refactoring-ui#voice + nicely-said. The rubric
// asks whether the words in the interface carry the design's intent —
// active over passive, specific over generic, inviting over apologetic,
// consistent across happy/empty/error states.
//
// Honors:
//   - ADR 0019: tier × impact × confidence preserved verbatim from the LLM.
//   - ADR 0020: id/version/status/authoredAt/contributors/source.ref required.

import type { RubricDefinition } from './hierarchy-clarity.js';

export const copyVoiceRubric: RubricDefinition = {
  id: 'rubric-copy-voice',
  name: 'Copy Voice',
  version: 1,
  status: 'stable',
  authoredAt: '2026-05-30',
  contributors: ['@chadjw'],
  appliesTo: ['component', 'page'],
  source: {
    ref: 'refactoring-ui#voice + nicely-said#tone',
    url: 'https://www.refactoringui.com/',
  },
  prompt: [
    'Evaluate the copy voice of {target}.',
    '',
    'Source under review:',
    '```',
    '{source}',
    '```',
    '',
    '- Are button labels written in active voice with a verb that names',
    '  the outcome ("Save changes", "Send invite") rather than generic',
    '  acknowledgements ("OK", "Submit", "Continue") that hide the action?',
    '- Are error messages specific and recovery-oriented ("This email is',
    '  already in use — sign in instead?") rather than blame-shaped',
    '  ("Error: invalid input", "Something went wrong") that leave the',
    '  user nowhere to go?',
    '- Are empty states inviting and forward-looking ("Start your first',
    '  project") rather than dead-end declarations ("No items.")?',
    '- Is helper / placeholder text doing work the label should do, or',
    '  vice-versa (a label that says "Email" with placeholder "Enter your',
    '  email" is two labels for one field)?',
    '- Does the voice stay consistent across happy / loading / empty /',
    '  error states, or does it shift register (warm onboarding → terse',
    '  errors → corporate compliance footer)?',
    '- Are there marketing-deck phrases ("unlock", "supercharge",',
    '  "seamless", "next-gen") leaking into the product surface where the',
    '  user just wants to do their task?',
    '',
    'Use the 3-axis output model (tier x impact x confidence). Copy reads',
    'fully from code (string literals, JSX text nodes, i18n keys), so',
    'confidence here should be high in fast/code-only mode for surfaces',
    'whose copy is colocated; lower if strings live in an external locale',
    'bundle the model cannot see.',
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
    'Stripe Connect onboarding — buttons read "Continue to verification"',
    'and "Save and exit" (verb + outcome, never "Submit"). The empty',
    'payouts table greets you with "You haven\'t received any payouts',
    'yet — your first will appear here once a charge clears." Error on a',
    'rejected card: "This card was declined by the issuer. Try a',
    'different card or contact your bank." Voice stays warm-direct',
    'across every state.',
  ].join('\n'),
  negativeExample: [
    'SaaS settings page — every primary CTA reads "Submit"; the empty',
    'projects view says "No projects."; the error toast on a 500 says',
    '"Error: failed to save (500)". A "Pro Tip!" callout near the top',
    'reads "Unlock the full power of next-gen workflows with our',
    'supercharged AI." None of the strings tell the user what to do',
    'next; none of them sound like the same product wrote them.',
  ].join('\n'),
  findingTemplate: {
    code: 'CRAFT-C008',
    tier: 'polish',
    impact: 'medium',
    phase: 'critique',
  },
};
