import type { SecurityRubric } from './index.js';

export const failClosedNotOpenRubric: SecurityRubric = {
  id: 'SEC-R006',
  title: 'Fail closed, not open',
  description:
    'When a security check fails (network error talking to the auth service, ' +
    'missing claim, malformed token, missing role attribute), does the code ' +
    'DENY (fail closed) or ALLOW (fail open)? Watch for: try/catch blocks ' +
    'around auth checks that swallow the error and proceed; default values ' +
    'that evaluate as truthy in absence of a real check; `if (user.role && ' +
    "user.role === 'admin')` patterns where a missing role attribute silently " +
    'passes a downstream check; permission lookups that return undefined on ' +
    'error then get coerced to false silently. Fail-closed is a deliberate ' +
    'design choice; fail-open is almost always an accident.',
  source: 'Saltzer & Schroeder, "fail-safe defaults" principle (1975)',
  appliesToSignals: ['auth-api', 'middleware', 'http-handler'],
  contribution: { addedAt: '2026-05-26', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
