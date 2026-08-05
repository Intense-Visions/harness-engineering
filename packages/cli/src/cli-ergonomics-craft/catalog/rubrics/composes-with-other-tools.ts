import type { CliRubric } from './types.js';

export const composesWithOtherToolsRubric: CliRubric = {
  id: 'CLI-R006',
  title: 'Composes with other tools (pipeable, machine-readable, honest exit codes)',
  description:
    'A CLI earns its place in a pipeline when its output is something the next tool can consume ' +
    'and its exit code tells the truth. Ask: is there a structured/machine-readable mode ' +
    '(--json or similar) for a command whose output a script would want to parse? Does the ' +
    'primary result go to stdout and diagnostics to stderr, so a pipe gets only the data? Does ' +
    'the process exit non-zero on failure so `&&` chains and CI stop? Does it read from stdin ' +
    'where that would compose (accepting `-` as a filename)? Watch for: results a human can read ' +
    'but grep/jq cannot; progress bars written to stdout; a command that prints an error yet ' +
    'exits 0; a tool that can only take a file path when a stream would compose better. gh ' +
    '(--json with field selection), ripgrep, and the Stripe CLI set the bar for machine-friendly ' +
    'output alongside the human view.',
  appliesTo: ['leaf'],
  source:
    'Unix philosophy (McIlroy — do one thing, text streams as the universal interface) + Command Line Interface Guidelines (clig.dev, "Machine-readable output")',
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
