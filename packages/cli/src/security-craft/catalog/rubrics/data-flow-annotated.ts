import type { SecurityRubric } from './index.js';

export const dataFlowAnnotatedRubric: SecurityRubric = {
  id: 'SEC-R005',
  title: 'Data flow across trust boundaries is visible in the code',
  description:
    'When data crosses a trust boundary (untrusted → trusted, low-priv → ' +
    'high-priv, in-tenant → cross-tenant), is the crossing visible in the code, ' +
    'or does it disappear into a variable rename? Tainted data should retain ' +
    'its taint in shape: parsed/validated → emerges as a typed value with a ' +
    'different name; raw user input passed deep into helpers without renaming ' +
    'or validation hides the boundary. Watch for: variables named `user`, `data`, ' +
    '`input` that started life as `req.body` but no longer signal their origin; ' +
    'tainted strings concatenated into queries with no parameterization layer; ' +
    'untrusted data forwarded across function boundaries with no validation ' +
    'checkpoint visible.',
  source: 'Information flow control (Denning, 1976) + taint tracking literature',
  appliesToSignals: ['http-handler', 'raw-query', 'data-egress', 'privileged-op'],
  contribution: { addedAt: '2026-05-26', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
