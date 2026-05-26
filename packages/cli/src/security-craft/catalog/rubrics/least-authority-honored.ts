import type { SecurityRubric } from './index.js';

export const leastAuthorityHonoredRubric: SecurityRubric = {
  id: 'SEC-R002',
  title: 'Principle of least authority honored',
  description:
    'Does this code take only the authority it needs, or does it operate with ' +
    'ambient privilege beyond what the task requires? Watch for: admin/service ' +
    'credentials used where a scoped token would do; root-equivalent DB user ' +
    'running queries that need only SELECT on one table; a handler that loads ' +
    'the full user record when only the id is needed downstream; broad scopes ' +
    'requested when narrow would do. Least authority is shape-level, not ' +
    'pattern-matchable — judgment call. Medium confidence covers shapes that ' +
    'suggest over-privilege; high requires a named ambient-privilege use.',
  source:
    'Saltzer & Schroeder, "The Protection of Information in Computer Systems" (1975) — principle of least privilege',
  appliesToSignals: ['auth-api', 'privileged-op', 'http-handler'],
  contribution: { addedAt: '2026-05-26', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
