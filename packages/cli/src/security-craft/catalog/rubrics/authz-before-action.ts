import type { SecurityRubric } from './index.js';

export const authzBeforeActionRubric: SecurityRubric = {
  id: 'SEC-R008',
  title: 'Authorization check happens before the privileged action',
  description:
    'Does the authorization check happen BEFORE the privileged action, or is ' +
    'the action initiated then validated? Pattern to flag: load the resource ' +
    'first, then check authz on the loaded resource. Even when the final ' +
    'response is denied, the load itself may have triggered observable ' +
    'side-effects (audit log entries, rate-limit counters, error messages ' +
    'that leak existence, downstream cache populations). Action-then-check ' +
    'is a class of TOCTOU and information-disclosure bug. The safe pattern: ' +
    'authorize first against the IDENTIFIER of the resource (id, slug, ' +
    'tenant), then load. Watch for: handlers that load a record, then call ' +
    '`if (record.ownerId !== user.id) return 403`; privileged ops that ' +
    'execute, then check whether the caller was allowed to call them.',
  source: 'CWE-862 Missing Authorization + TOCTOU literature',
  appliesToSignals: ['http-handler', 'privileged-op'],
  contribution: { addedAt: '2026-05-26', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
