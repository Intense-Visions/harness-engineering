/**
 * Living catalog (ADR 0020) — curated documentation exemplars for docs-craft.
 *
 * These are REFERENCE POINTS, not fabricated content: each entry names a real,
 * publicly visible documentation set and states the single craft dimension it
 * best exemplifies. They ground the rubric catalog (so a critique can cite "the
 * bar Stripe sets for runnable examples") and seed a future BENCHMARK phase —
 * the direct analogue of harness-design-craft's exemplar corpus.
 *
 * v1 is CRITIQUE-only; the exemplar set exists to anchor rubric sources and to
 * give the growth catalog a place to accrete. No exemplar prose is reproduced.
 */

export interface DocsExemplar {
  /** Stable id in the docs-craft exemplar namespace. */
  id: string;
  /** Human name of the documentation set. */
  name: string;
  /** Public URL of the documentation set. */
  url: string;
  /** The one craft dimension this set best exemplifies. */
  exemplifies: string;
  /** Which seed rubric ids this exemplar most directly anchors. */
  anchors: ReadonlyArray<string>;
}

export const SEED_EXEMPLARS: ReadonlyArray<DocsExemplar> = [
  {
    id: 'stripe-api-reference',
    name: 'Stripe Docs',
    url: 'https://docs.stripe.com/api',
    exemplifies:
      'Every endpoint pairs a runnable request with a full example response and the errors it ' +
      'can raise — the reader predicts the response shape before running anything.',
    anchors: ['DOCS-R003', 'DOCS-R005', 'DOCS-R002'],
  },
  {
    id: 'vercel-docs',
    name: 'Vercel Docs',
    url: 'https://vercel.com/docs',
    exemplifies:
      'Plain, confident, second-person voice with task-first framing — prose that reads as a ' +
      'person talking to you, never a compliance memo.',
    anchors: ['DOCS-R004', 'DOCS-R001'],
  },
  {
    id: 'mdn-web-docs',
    name: 'MDN Web Docs',
    url: 'https://developer.mozilla.org',
    exemplifies:
      'Assumes no shared context: every term is defined or linked on first use, and each API ' +
      'entry always spells out return value and exceptions.',
    anchors: ['DOCS-R005', 'DOCS-R006'],
  },
  {
    id: 'linear-docs',
    name: 'Linear Docs',
    url: 'https://linear.app/docs',
    exemplifies:
      'Progressive disclosure and scannability — descriptive headings, tight paragraphs, and a ' +
      'quickstart-first order that defers depth until the reader asks for it.',
    anchors: ['DOCS-R002', 'DOCS-R007'],
  },
  {
    id: 'tailwind-docs',
    name: 'Tailwind CSS Docs',
    url: 'https://tailwindcss.com/docs',
    exemplifies:
      'Copy-paste-runnable examples paired with the exact result they produce, and a structure ' +
      'the eye can land on — examples that always earn their place.',
    anchors: ['DOCS-R003', 'DOCS-R007'],
  },
];
