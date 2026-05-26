import type { SecurityRubric } from './index.js';

export const defenseInDepthRubric: SecurityRubric = {
  id: 'SEC-R003',
  title: 'Defense in depth (not gate-only)',
  description:
    'Is there a layer of defense behind the gate, or does the whole protection ' +
    'ride on one check? A handler that does `if (!req.user) return 401` and then ' +
    'trusts every downstream call is gate-only. Defense-in-depth means: the ' +
    'service-layer call also checks authorization; the database query is scoped ' +
    'to the tenant by query construction, not just by the prior auth check; the ' +
    'log line includes the actor so a bypass is observable. Watch for: single ' +
    'auth check at the top of a handler that performs multiple privileged ' +
    'actions, downstream functions that ASSUME the caller checked auth, services ' +
    'with no internal scoping that rely entirely on upstream gates.',
  source: 'NSA "Defense in Depth" (2010) + NIST SP 800-160 vol 2 layered defense principle',
  appliesToSignals: ['auth-api', 'http-handler'],
  contribution: { addedAt: '2026-05-26', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
