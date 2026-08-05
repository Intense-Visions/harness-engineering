import type { CliRubric } from './types.js';

export const defaultsAreSaneRubric: CliRubric = {
  id: 'CLI-R004',
  title: 'Defaults are sane and the safe path is the default',
  description:
    'The zero-flag invocation should do the thing the user most likely wants, safely. Ask: does ' +
    'the command work with no flags for the common case, or does it demand ceremony up front? ' +
    'Is the default the SAFE option (dry-run or confirm before destroy, current directory over ' +
    'a guessed one, no network write unless asked)? Are required inputs truly required, or could ' +
    'a sensible default remove the friction? Watch for: a mandatory flag that always takes the ' +
    'same value; a default that mutates or overwrites without asking; a required positional that ' +
    'could default to the obvious choice; "you must pass --config" when discovery would find it. ' +
    'The principle is least surprise (Raymond): the default behavior should match what a ' +
    'reasonable user expects before reading the docs.',
  appliesTo: ['leaf'],
  source:
    'Command Line Interface Guidelines (clig.dev, "Sensible defaults") + Raymond, "The Art of UNIX Programming" (Rule of Least Surprise)',
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
