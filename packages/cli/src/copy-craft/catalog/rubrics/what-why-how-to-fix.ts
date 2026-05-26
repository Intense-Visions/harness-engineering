import type { CopyRubric } from './index.js';

export const whatWhyHowToFixRubric: CopyRubric = {
  id: 'COPY-R001',
  title: 'Tells WHAT, WHY, and HOW-TO-FIX',
  description:
    'A useful error message answers three questions: WHAT failed (the operation), WHY ' +
    '(the underlying cause when known), and HOW to fix (the action the user can take). ' +
    'Messages like "An error occurred" or "Failed" answer none. Messages like "Could not ' +
    'connect to redis at 127.0.0.1:6379: connection refused. Check that redis is running." ' +
    'answer all three.',
  source: 'Stripe API error guide + Resend API error design + Nielsen heuristic #9',
  appliesToSurfaces: ['error'],
  contribution: { addedAt: '2026-05-25', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
