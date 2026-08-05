import type { DocsRubric } from './types.js';

export const strangerSameUnderstandingRubric: DocsRubric = {
  id: 'DOCS-R006',
  title: 'A stranger walks away with the same understanding',
  description:
    'A doc should carry its own context so a reader with no insider knowledge arrives at the ' +
    'same understanding the author has. Ask: does it lean on unstated assumptions, undefined ' +
    'jargon, or acronyms expanded nowhere? Does it reference internal systems, tickets, or ' +
    'people by name as if the reader already knows them? Would a competent newcomer to this ' +
    'project be able to act on it, or would they have to ask someone? Watch for: first use of ' +
    'an acronym with no expansion; "as discussed" / "the usual way" with no link; product or ' +
    'code names used before they are introduced; steps that silently assume a tool is already ' +
    'installed or a permission already granted. MDN is the benchmark: it assumes no shared ' +
    'context and links or defines every term on first use.',
  appliesTo: ['*'],
  source: 'MDN Web Docs (no-shared-context principle) + "Docs for Developers"',
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
