import type { CliRubric } from './types.js';

export const namesArePredictableRubric: CliRubric = {
  id: 'CLI-R001',
  title: 'Command and flag names are predictable and consistent',
  description:
    'A user should be able to guess the name of a command or flag they have not seen yet from ' +
    'the ones they have. Ask: do subcommands share one grammar (noun-verb OR verb-noun, not ' +
    'both), do flags reuse the same spelling for the same concept everywhere (--output, not ' +
    '--out here and --format there), are the common flags the conventional ones (-v/--verbose, ' +
    '-o/--output, -f/--force, -q/--quiet, -h/--help), and does every short flag have a long ' +
    'twin? Watch for: a --recursive on one subcommand and -R on another; a verb tacked onto a ' +
    'noun-first family ("repo create" beside "delete-branch"); an abbreviation only the author ' +
    'would expand; a flag that shadows a well-known convention with a different meaning. gh sets ' +
    'the bar: every command reads "gh <noun> <verb>" and the same flag means the same thing ' +
    'across the whole surface.',
  appliesTo: ['*'],
  source: 'Command Line Interface Guidelines (clig.dev, "Naming") + POSIX Utility Conventions',
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
