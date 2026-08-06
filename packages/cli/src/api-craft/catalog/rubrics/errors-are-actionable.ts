import type { ApiRubric } from './types.js';

export const errorsAreActionableRubric: ApiRubric = {
  id: 'API-R005',
  title: 'Error responses tell the consumer what to do',
  description:
    'An error is a message to a developer who is stuck — it must say what went wrong AND what to ' +
    'do next, in a shape code can branch on. Ask: does the error body carry a STABLE machine- ' +
    'readable code (`"code": "card_declined"`) the client can switch on, distinct from the human ' +
    'message? Does it name the offending field for a validation error, so the caller can fix the ' +
    'exact input? Is the shape the SAME across every endpoint, so one error handler works API- ' +
    'wide? Does it point at the remedy (which parameter, which permission, which retry) rather ' +
    'than leaking a stack trace or an internal SQL string? Watch for: a bare string with no code; ' +
    'error shapes that differ per endpoint; a message that restates the status code and nothing ' +
    'more; an internal exception surfaced verbatim. Stripe’s typed error objects (type + code + ' +
    'param + message) set the bar.',
  appliesTo: ['*'],
  source: 'Stripe API error design + RFC 9457 (Problem Details for HTTP APIs)',
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
