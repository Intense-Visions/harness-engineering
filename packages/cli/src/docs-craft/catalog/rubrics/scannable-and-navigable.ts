import type { DocsRubric } from './types.js';

export const scannableAndNavigableRubric: DocsRubric = {
  id: 'DOCS-R007',
  title: 'Scannable and navigable (a reader finds the answer fast)',
  description:
    'Readers scan documentation before they read it. A doc earns its craft when a reader can ' +
    'find the one thing they came for in seconds. Ask: do headings describe content so a reader ' +
    'can jump (not "Overview", "Details", "More"), are paragraphs short enough to skim, are ' +
    'lists and tables used where they beat prose, is there a wall of text where structure would ' +
    'help? Watch for: multi-screen sections with no subheadings; headings that carry no ' +
    'information ("Introduction"); a 400-word paragraph that should be a five-item list; a ' +
    'reference page with no anchors to deep-link. Linear, Stripe, and Tailwind docs are the ' +
    'benchmark for scannability — descriptive headings, tight paragraphs, and structure that ' +
    'lets the eye land on the answer.',
  appliesTo: ['*'],
  source: 'Nielsen Norman Group (how users read on the web) + Linear / Stripe / Tailwind docs IA',
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
