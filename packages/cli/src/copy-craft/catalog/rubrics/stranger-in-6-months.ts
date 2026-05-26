import type { CopyRubric } from './index.js';

export const strangerInSixMonthsRubric: CopyRubric = {
  id: 'COPY-R007',
  title: 'Stranger in 6 months',
  description:
    'Could a stranger reading this in 6 months still understand it without your current ' +
    'context? Watch for: references to "the recent discussion" or "as we discussed", names ' +
    "of people without their role, jargon specific to this team's current vocabulary, " +
    'PR / Slack thread links assumed-accessible. Commit subjects, PR descriptions, and ' +
    'comments are time capsules — assume the reader has none of your current context.',
  source: 'Software-engineering folklore (the durability principle) + Pragmatic Programmer',
  appliesToSurfaces: ['commit', 'pr-description', 'comment'],
  contribution: { addedAt: '2026-05-25', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
