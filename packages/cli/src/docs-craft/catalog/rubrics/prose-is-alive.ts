import type { DocsRubric } from './types.js';

export const proseIsAliveRubric: DocsRubric = {
  id: 'DOCS-R004',
  title: 'Prose is alive, not bureaucratic',
  description:
    'Documentation prose should read like a knowledgeable person talking directly to the ' +
    'reader, not like a compliance memo. Ask: is it direct and active, or clogged with passive ' +
    'voice, nominalizations, hedging, and filler? "You can configure the timeout" beats "The ' +
    'timeout may be configured by the user." "This fails when the token expires" beats "Failures ' +
    'may occur in the event of token expiration." Watch for: "in order to" (use "to"), "it ' +
    'should be noted that", "please be aware", "utilize" (use "use"), "leverage", stacked ' +
    'qualifiers ("generally, in most cases, typically"), and sentences so long the verb is lost. ' +
    'Vercel and Linear docs are the voice benchmark: plain, confident, second-person, no fat.',
  appliesTo: ['*'],
  source: 'Strunk & White "Elements of Style" + Vercel / Linear documentation voice',
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
