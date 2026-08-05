import type { CliRubric } from './types.js';

export const helpIsTaskOrientedRubric: CliRubric = {
  id: 'CLI-R002',
  title: 'Help text is task-oriented (teaches the job, not just lists flags)',
  description:
    'Help text earns its space when it tells the user what the command is FOR and how to get a ' +
    'real job done — not merely which flags exist. Ask: does the one-line description name the ' +
    'outcome (not restate the command name)? Is there at least one worked example of a common ' +
    'invocation? Are flags described in terms of what they let the user accomplish, with their ' +
    'defaults stated? Watch for: a description that just re-spells the command ("build: builds ' +
    'the project"); a flag reference with no example anywhere; help that assumes the reader ' +
    'already knows the mental model; a wall of options with no grouping or ordering by ' +
    'frequency. cargo and the Stripe CLI set the bar: help opens with what you would use the ' +
    'command for, shows an example, then lists options with sane-default annotations.',
  appliesTo: ['*'],
  source: 'Command Line Interface Guidelines (clig.dev, "Help") + man-page (man 1) conventions',
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
