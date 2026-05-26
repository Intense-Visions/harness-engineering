import type { CopyRubric } from './index.js';

export const grepSurvivesRubric: CopyRubric = {
  id: 'COPY-R005',
  title: 'Survives grep',
  description:
    'Logs and CLI output should be searchable. Static substrings (operation names, status ' +
    'transitions) should be greppable even when surrounded by varying data. ' +
    'Examples that survive grep: `user.invitation.accepted` and `backfill: processed 1234 rows in 567ms`. ' +
    'An example that does not: `all done with that one`. Avoid sentence-style prose where a keyword would do.',
  source: 'Site Reliability Engineering + Unix philosophy (grep-as-API)',
  appliesToSurfaces: ['log', 'cli-output'],
  contribution: { addedAt: '2026-05-25', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
