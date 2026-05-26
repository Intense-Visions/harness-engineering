import type { SecurityRubric } from './index.js';

export const assumedAdversaryRealisticRubric: SecurityRubric = {
  id: 'SEC-R004',
  title: 'Assumed adversary realistic for the deployment',
  description:
    'What adversary is this code defending against, and does the threat model ' +
    'match the actual deployment? A handler that validates an internal ' +
    'service-to-service token as if it were public input may be over-defending; ' +
    'a handler that accepts a request from the public internet but assumes ' +
    "well-formed JSON because 'our clients send well-formed JSON' is " +
    'under-defending. The assumed adversary should match: public endpoint = ' +
    'hostile internet; internal microservice = colleague-on-the-network; admin ' +
    'tool = compromised insider. Watch for: input validation that maps ' +
    'incorrectly to the adversary, missing rate-limit / abuse-resistance on ' +
    'public endpoints, hostile-input shape applied to internal-only paths.',
  source: 'Microsoft STRIDE threat modeling + Adam Shostack, Threat Modeling (2014)',
  appliesToSignals: ['http-handler', 'middleware', 'auth-api'],
  contribution: { addedAt: '2026-05-26', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
