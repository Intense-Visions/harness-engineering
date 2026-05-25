import type { NamingRubric } from './index.js';

export const encodedMeasureRubric: NamingRubric = {
  id: 'NAME-R006',
  title: 'Encoded measure / unit',
  description:
    'When a name implies a unit or measure (timeout, delay, size, distance, weight, latency), ' +
    'the unit should be visible in the name (`timeoutMs` not `timeout`; `sizeBytes` not `size`; ' +
    '`distanceKm` not `distance`). Silent units cause real production bugs (the Mars Climate ' +
    'Orbiter loss is the canonical example). Punish silent units; reward explicit ones.',
  source: 'Hunt + Thomas, Pragmatic Programmer — name your units',
  appliesTo: ['variable', 'function'],
  contribution: { addedAt: '2026-05-24', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
