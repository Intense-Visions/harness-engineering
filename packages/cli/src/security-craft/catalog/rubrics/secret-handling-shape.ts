import type { SecurityRubric } from './index.js';

export const secretHandlingShapeRubric: SecurityRubric = {
  id: 'SEC-R007',
  title: 'Secrets carried in a shape that resists leakage',
  description:
    'Are secrets (tokens, passwords, API keys, private keys, session IDs) ' +
    'passed through the code in a shape that resists accidental logging or ' +
    'serialization, or are they bare strings that can leak through ' +
    '`console.log`, `JSON.stringify`, template-literal interpolation, error ' +
    'messages, or stack traces? A wrapped opaque type (`SecretToken`, ' +
    "`Brand<string, 'secret'>`) makes accidental serialization visible at the " +
    'boundary; a bare string flows wherever any string flows. Watch for: ' +
    'secret-named variables passed into log calls, secret values interpolated ' +
    'into error messages, request/response objects logged whole when they ' +
    'contain auth headers, JSON.stringify of objects that include secret ' +
    'fields without redaction.',
  source: 'OWASP A09 Security Logging and Monitoring Failures + branded-type literature',
  appliesToSignals: ['secret-handling'],
  contribution: { addedAt: '2026-05-26', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
