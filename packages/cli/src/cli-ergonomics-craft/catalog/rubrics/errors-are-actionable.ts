import type { CliRubric } from './types.js';

export const errorsAreActionableRubric: CliRubric = {
  id: 'CLI-R003',
  title: 'Errors are actionable (name the cause AND the next step)',
  description:
    'A good CLI error tells the user what went wrong AND what to do about it — in their terms, ' +
    'not the program internals. Ask: does each failure path say which input was bad and how to ' +
    'fix it (a suggested command, a "did you mean", a link, a flag to add)? Are expected errors ' +
    '(missing file, bad flag, no auth) caught and rewritten, or do they surface as a raw stack ' +
    'trace / unhandled exception? Does the exit stay non-zero on failure? Watch for: throwing a ' +
    'bare Error with a developer message; "invalid argument" with no hint at what would be ' +
    'valid; catch blocks that swallow the cause; a validation failure that dumps a stack instead ' +
    'of one clear line. cargo is the benchmark: a typo yields "no such subcommand: `buld`. Did ' +
    'you mean `build`?" — the fix is in the message.',
  appliesTo: ['leaf'],
  source:
    'Command Line Interface Guidelines (clig.dev, "Errors") + Nielsen Norman Group error-message heuristics',
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
