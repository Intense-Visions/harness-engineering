import type { SecurityRubric } from './index.js';

export const trustBoundaryRespectedRubric: SecurityRubric = {
  id: 'SEC-R001',
  title: 'Trust boundary respected (no accidental bridging)',
  description:
    'A trust boundary sits between untrusted input (request body, query string, ' +
    'header) and a privileged sink (database query, shell command, filesystem ' +
    'write, network egress to internal service). Does the code respect that ' +
    'boundary, or does user-controlled data flow into a privileged sink without ' +
    'an intermediate validation, parameterization, or escaping step? Watch for: ' +
    'string concatenation into SQL, user input forwarded to child_process.exec, ' +
    'request body fields passed to fs.writeFile path, server-side fetch URL ' +
    'built from user input. High confidence requires seeing the specific user-data ' +
    '→ sink flow in the snippet. Medium confidence covers shapes that LOOK risky ' +
    'without proof of the exact flow.',
  source: 'OWASP A03 Injection + Saltzer & Schroeder, complete mediation',
  appliesToSignals: ['http-handler', 'middleware', 'raw-query', 'privileged-op'],
  contribution: { addedAt: '2026-05-26', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
