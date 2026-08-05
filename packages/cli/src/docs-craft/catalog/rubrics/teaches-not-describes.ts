import type { DocsRubric } from './types.js';

export const teachesNotDescribesRubric: DocsRubric = {
  id: 'DOCS-R001',
  title: 'Teaches a mental model (not a feature enumeration)',
  description:
    'Great documentation teaches — it hands the reader a mental model they can reason with, ' +
    'not just a list of what exists. Ask: after reading this, could the reader predict how the ' +
    'thing behaves in a situation the doc did NOT spell out? A page that enumerates every option ' +
    'without ever saying WHY you would reach for one, or WHAT problem the feature solves, ' +
    'describes but does not teach. Watch for: a wall of parameter tables with no orienting ' +
    'paragraph; "the system supports X, Y, and Z" with no guidance on choosing; a tour of the ' +
    'UI that never states the job the reader is trying to get done. The best pages (Stripe, MDN) ' +
    'open by naming the problem and the shape of the solution, THEN drill into specifics.',
  appliesTo: ['*'],
  source: 'Diátaxis (Divio documentation system) + "Docs for Developers" (Bhattacharya et al.)',
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
