export interface CliRubric {
  id: string;
  title: string;
  description: string;
  /** Command kinds this rubric applies to. `'*'` means every discovered command. */
  appliesTo: ReadonlyArray<CommandKind> | ['*'];
  source: string;
  contribution: { addedAt: string; addedBy: string };
  signal: { invocations: number; suppressedAt: string[] };
  version: number;
}

/**
 * Coarse classification of a discovered CLI command definition. Used to filter
 * rubrics (the destructive-action-guard rubric should not fire on a pure
 * namespace command that only hosts subcommands) and to shape the critique
 * prompt.
 *
 * - `leaf`: a command with its own action handler — it does work, produces
 *   output, can error, and may mutate state. Every rubric applies.
 * - `group`: a command whose job is to host subcommands (a namespace). Only
 *   the naming and help rubrics apply; it has no output or error path of its
 *   own to critique.
 */
export type CommandKind = 'leaf' | 'group';
