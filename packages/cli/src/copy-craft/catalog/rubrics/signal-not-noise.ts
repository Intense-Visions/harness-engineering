import type { CopyRubric } from './index.js';

export const signalNotNoiseRubric: CopyRubric = {
  id: 'COPY-R004',
  title: 'Signal, not noise',
  description:
    'Every log line should be worth scanning at 3am during an incident. Lines like ' +
    '"entered function", "x = 1", "starting", "done" are noise — they fire too often to ' +
    'be useful and crowd out signal. Useful log lines carry state changes, transitions, ' +
    'decisions, or exceptional paths with the data needed to understand them.',
  source: 'Site Reliability Engineering (Google book), ch. on observability',
  appliesToSurfaces: ['log'],
  contribution: { addedAt: '2026-05-25', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
