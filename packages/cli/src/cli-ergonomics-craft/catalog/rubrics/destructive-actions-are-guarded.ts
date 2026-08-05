import type { CliRubric } from './types.js';

export const destructiveActionsAreGuardedRubric: CliRubric = {
  id: 'CLI-R007',
  title: 'Destructive actions are guarded',
  description:
    'Any command that deletes, overwrites, or is otherwise hard to undo should make the user ' +
    'mean it. Ask: does an irreversible action confirm before proceeding (or require an ' +
    'explicit --force / --yes), offer a --dry-run to preview, and scope its blast radius rather ' +
    'than defaulting to "everything"? Is a non-interactive run (no TTY, CI) handled so it does ' +
    'not either hang on a prompt or silently destroy? Watch for: a delete/reset/prune that runs ' +
    'immediately with no confirmation and no dry-run; --force as the ONLY mode instead of the ' +
    'override; a recursive/global default; a confirmation that cannot be bypassed for automation ' +
    'so users learn to pipe `yes`. docker is the reference point: `system prune` states what it ' +
    'will remove and asks to continue, with --force to override for scripts.',
  appliesTo: ['leaf'],
  source:
    'Command Line Interface Guidelines (clig.dev, "Robustness" — confirm before destructive operations) + Raymond, Rule of Least Surprise',
  contribution: { addedAt: '2026-08-05', addedBy: 'seed' },
  signal: { invocations: 0, suppressedAt: [] },
  version: 1,
};
