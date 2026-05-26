import type { CopyRubric } from './index.js';

export const calmNotPanickyRubric: CopyRubric = {
  id: 'COPY-R002',
  title: 'Calm, not panicky',
  description:
    'The tone of error and log messages should be calm and specific, not alarming. ' +
    '"CATASTROPHIC FAILURE", "Something terrible happened!", and excessive exclamation marks ' +
    'signal panic without conveying information. Calm messages ("could not resolve config ' +
    'file", "request timeout after 30s") convey what happened without performing distress.',
  source: 'Mailchimp voice guide + Atlassian writing principles (tone in errors)',
  appliesToSurfaces: ['error', 'log'],
  contribution: { addedAt: '2026-05-25', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
