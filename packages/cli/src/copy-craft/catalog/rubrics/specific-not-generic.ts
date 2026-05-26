import type { CopyRubric } from './index.js';

export const specificNotGenericRubric: CopyRubric = {
  id: 'COPY-R003',
  title: 'Specific, not generic',
  description:
    "Names the operation and artifact, not just 'error' or 'failed'. \"failed to parse " +
    'tokens.json" beats "parse error". "could not connect to redis at 127.0.0.1:6379" ' +
    'beats "connection failed". Generic substrings ("something went wrong", "an error ' +
    'occurred", "operation failed") are tells — replace with concrete nouns and verbs.',
  source: 'Martin, Clean Code (chapter on error handling) + Stripe API design',
  appliesToSurfaces: ['error', 'log', 'cli-output'],
  contribution: { addedAt: '2026-05-25', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
