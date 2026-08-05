import type { CliRubric } from './types.js';

export const outputIsScannableRubric: CliRubric = {
  id: 'CLI-R005',
  title: 'Output is scannable for a human and respects the terminal',
  description:
    'Human-facing output should let the eye land on the answer, and it should adapt to the ' +
    'terminal it runs in. Ask: is the important result visually distinct from the noise, or is ' +
    'everything one undifferentiated stream? Does color/emphasis carry meaning (and turn off ' +
    'when the output is not a TTY or when NO_COLOR is set)? Is progress/log chatter kept off ' +
    'stdout so it does not pollute the real result? Is the volume proportionate — quiet on ' +
    'success, detailed on demand (--verbose)? Watch for: color codes emitted into a pipe; a ' +
    'success message buried under debug lines; walls of text where a short table or key result ' +
    'would do; the primary output mixed with diagnostics on the same stream. ripgrep is the ' +
    'benchmark: colored, aligned, grouped output on a terminal; plain, uncolored, script-safe ' +
    'output the moment it is piped.',
  appliesTo: ['leaf'],
  source:
    'Command Line Interface Guidelines (clig.dev, "Output") + Nielsen Norman Group (scannability) + the NO_COLOR convention',
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
