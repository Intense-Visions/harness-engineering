/**
 * Living catalog (ADR 0020) — curated code exemplars for code-craft.
 *
 * These are REFERENCE POINTS, not fabricated content: each entry names a real,
 * publicly visible TS/JS codebase and states the single craft dimension it
 * best exemplifies. They ground the rubric catalog (so a critique can cite "the
 * bar TanStack Query sets for a deep module") and seed a future BENCHMARK phase
 * — the direct analogue of docs-craft's and design-craft's exemplar corpus. No
 * exemplar source is reproduced.
 *
 * v1 is CRITIQUE-only; the exemplar set exists to anchor rubric sources and to
 * give the growth catalog a place to accrete.
 */

export interface CodeExemplar {
  /** Stable id in the code-craft exemplar namespace. */
  id: string;
  /** Human name of the codebase. */
  name: string;
  /** Public URL of the source. */
  url: string;
  /** The one craft dimension this codebase best exemplifies. */
  exemplifies: string;
  /** Which seed rubric ids this exemplar most directly anchors. */
  anchors: ReadonlyArray<string>;
}

export const SEED_EXEMPLARS: ReadonlyArray<CodeExemplar> = [
  {
    id: 'anthropic-sdk-typescript',
    name: 'Anthropic SDK (TypeScript)',
    url: 'https://github.com/anthropics/anthropic-sdk-typescript',
    exemplifies:
      'An SDK surface whose public functions read exactly as their purpose — honest signatures, ' +
      'minimal ceremony, effects that match the names.',
    anchors: ['CODE-R001', 'CODE-R006'],
  },
  {
    id: 'tanstack-query',
    name: 'TanStack Query',
    url: 'https://github.com/TanStack/query',
    exemplifies:
      'A deep module: a small, calm public API hiding a large amount of cache/retry/dedup ' +
      'machinery, so the caller carries far less than the author did.',
    anchors: ['CODE-R004'],
  },
  {
    id: 'sindresorhus-ky',
    name: 'ky (Sindre Sorhus)',
    url: 'https://github.com/sindresorhus/ky',
    exemplifies:
      'Small single-responsibility functions, each doing one thing at one level of abstraction ' +
      'with a happy path that reads straight down.',
    anchors: ['CODE-R003', 'CODE-R002'],
  },
  {
    id: 'vercel-swr',
    name: 'SWR (Vercel)',
    url: 'https://github.com/vercel/swr',
    exemplifies:
      'Honest control flow — edge cases handled with early guards, the main logic never buried ' +
      'in nested branches.',
    anchors: ['CODE-R002', 'CODE-R007'],
  },
  {
    id: 'date-fns',
    name: 'date-fns',
    url: 'https://github.com/date-fns/date-fns',
    exemplifies:
      'Pure, intention-revealing functions that stay as simple as the problem allows — each ' +
      'independently readable, no accidental complexity carried along.',
    anchors: ['CODE-R001', 'CODE-R005'],
  },
];
