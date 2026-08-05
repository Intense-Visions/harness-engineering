/**
 * Living catalog (ADR 0020) — seed rubrics for cli-ergonomics-craft v1.
 *
 * The ceiling questions for a CLI. There is no rule-based floor twin here (a
 * mechanical linter can check that a flag is documented, but not whether the
 * name is predictable, whether the help teaches, whether the error says what to
 * do next). These rubrics ask what only judgment can: are command and flag
 * names predictable, is help task-oriented, are errors actionable, are defaults
 * sane, is output scannable, does the CLI compose, are destructive actions
 * guarded.
 *
 * Structural twin of docs-craft's rubric catalog.
 */

export type { CliRubric, CommandKind } from './types.js';

import type { CliRubric, CommandKind } from './types.js';
import { namesArePredictableRubric } from './names-are-predictable.js';
import { helpIsTaskOrientedRubric } from './help-is-task-oriented.js';
import { errorsAreActionableRubric } from './errors-are-actionable.js';
import { defaultsAreSaneRubric } from './defaults-are-sane.js';
import { outputIsScannableRubric } from './output-is-scannable.js';
import { composesWithOtherToolsRubric } from './composes-with-other-tools.js';
import { destructiveActionsAreGuardedRubric } from './destructive-actions-are-guarded.js';

/**
 * v1 default rubric set — 7 seed entries for CLI ergonomics quality.
 */
export const SEED_RUBRICS: ReadonlyArray<CliRubric> = [
  namesArePredictableRubric,
  helpIsTaskOrientedRubric,
  errorsAreActionableRubric,
  defaultsAreSaneRubric,
  outputIsScannableRubric,
  composesWithOtherToolsRubric,
  destructiveActionsAreGuardedRubric,
];

/**
 * Return the rubrics that apply to a given command kind. A rubric with
 * `appliesTo: ['*']` applies to every command; otherwise the command kind must
 * be in the rubric's `appliesTo` list. Naming (CLI-R001) and help (CLI-R002)
 * apply to every command; the other five critique a leaf command's own output,
 * error, default, and safety surfaces, which a pure namespace `group` does not
 * have.
 */
export function rubricsForKind(kind: CommandKind): CliRubric[] {
  return SEED_RUBRICS.filter(
    (r) => r.appliesTo[0] === '*' || (r.appliesTo as ReadonlyArray<CommandKind>).includes(kind)
  );
}
