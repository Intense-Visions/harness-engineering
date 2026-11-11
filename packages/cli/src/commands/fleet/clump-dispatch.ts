// packages/cli/src/commands/fleet/clump-dispatch.ts
//
// `harness fleet clump-dispatch` — the EXECUTION seam's runnable surface
// (docs/changes/clumping/proposal.md, Phase 5).
//
// The third sibling of `harness fleet budget-check` and `harness fleet
// clump-issues`, and it exists for the same reason both of those do. The four
// members whose lane unit a clump becomes — `roadmap-fleet`, `bug-fleet`,
// `cleanup-fleet`, `craft-fleet` — are SKILL.md files. NOTHING in this
// repository schedules their lanes: their DISPATCH and VERIFY contracts are
// prose an agent is trusted to apply, which is a seam nothing can be held to.
// So the contract gets a callable, and the prose points at the callable.
//
// Two modes, one per phase of the contract:
//
//   DISPATCH (default) — read the clumps a run EMITTED and print one PR plan
//     per clump, with one commit per member. This is the half that closes the
//     craft set-but-never-read risk: `--input` takes a craft run's own JSON
//     output, whose `clumps` field Phase 3 wired and nothing read. A craft
//     output that carries `findings` and no `clumps` is REJECTED rather than
//     reported as zero plans, because a lane that re-folds findings into
//     targets by hand is the exact behaviour this phase replaces, and zero
//     plans over a findings-only input is indistinguishable from a backlog
//     that genuinely held no groups.
//
//   VERIFY (`--verdict`) — settle ONE verdict per clump under D10: a member
//     that fails is dropped by reverting its own commit and the clump proceeds
//     with the rest; the clump fails only when the remainder is empty or no
//     longer builds.
//
// It never mutates anything. It plans and it settles; running the plan is the
// lane's job.

import * as fs from 'node:fs';

import {
  checkVerdictPartition,
  planClumpPR,
  settleClumpVerdict,
  type ClumpMemberOutcome,
  type ClumpPRPlan,
  type ClumpVerdict,
  type PlannableClump,
  type PlannableMember,
  type PostDropBuild,
} from '@harness-engineering/core';
import chalk from 'chalk';
import { Command } from 'commander';

/** Exit code for a clump whose verdict is `failed` — no usable post-drop remainder. */
export const CLUMP_FAILED_EXIT_CODE = 13;

/** Exit code for an input that carries no clump set to dispatch. */
export const NO_CLUMPS_INPUT_EXIT_CODE = 14;

/** Exit code for a D10 partition breach — a member fell out of the verdict. */
export const VERDICT_PARTITION_BREACH_EXIT_CODE = 15;

/**
 * Exit code for a payload that HAS a `clumps` field of the wrong shape.
 *
 * Distinct from {@link NO_CLUMPS_INPUT_EXIT_CODE} on purpose. "You gave me no
 * clump set" and "you gave me a clump set I cannot read" are different lane
 * mistakes with different fixes, and a shared code would make the second
 * indistinguishable from the first in CI output. Both are refusals; neither is
 * an empty plan list.
 */
export const MALFORMED_CLUMP_INPUT_EXIT_CODE = 16;

export interface ClumpDispatchOptions {
  /** The emitted clump set: a craft run's JSON output, a `clump-issues --json` dump, or a bare ClumpResult. `-` = stdin. */
  input: string;
  /** Member outcomes to settle under D10. `-` = stdin (mutually exclusive with an `--input` of `-`). */
  verdict?: string;
  /** Whether the tree still builds after the drops were reverted. */
  postDropBuild?: PostDropBuild;
  /** Conventional-commit type for the planned title and subjects. Default `fix`. */
  commitType?: string;
  json?: boolean;
}

/** An input that carried no usable clump set, with the gap named rather than simulated. */
export interface ClumpInputGap {
  gap: string;
  /**
   * The exit code this gap settles on. Absent ⇒ {@link NO_CLUMPS_INPUT_EXIT_CODE}.
   *
   * Carried on the value rather than decided at the print site, because the
   * print site cannot tell the two refusals apart once the message is a string.
   */
  exit?: number;
}

/** The clump array nested one level under a `clumps` field, if there is one. */
function nestedClumps(value: unknown): readonly unknown[] | null {
  if (Array.isArray(value)) return value;
  if (value === null || typeof value !== 'object') return null;
  const inner = (value as Record<string, unknown>).clumps;
  return Array.isArray(inner) ? inner : null;
}

/** What a value is, for a gap message: `3`, `"x"`, `null`, `an array`, `an object`. */
function describeValue(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'an array';
  if (typeof value === 'object') return 'an object';
  // `JSON.stringify` answers `undefined` for `undefined`, a function and a
  // symbol; naming the type beats coercing a value whose `toString` is unknown.
  return JSON.stringify(value) ?? typeof value;
}

/** Does this value satisfy `PlannableMember` — an object with a string `id`? */
function memberGap(member: unknown, where: string): string | null {
  if (member === null || typeof member !== 'object' || Array.isArray(member)) {
    return `${where} is ${describeValue(member)}, not an object carrying an \`id\``;
  }
  const id = (member as Record<string, unknown>).id;
  if (typeof id !== 'string' || id === '') {
    return `${where}.id is ${describeValue(id)}, not a non-empty string`;
  }
  return null;
}

/**
 * Does this value satisfy `PlannableClump`, or what is wrong with it?
 *
 * THE CAST THIS REPLACES IS THE DEFECT, measured rather than hypothesized.
 * `extractClumps` used to cast whatever array it found straight to
 * `readonly PlannableClump[]`, and the only producer available to three of the
 * four fleet members (`harness fleet clump-issues --json`) serialized members
 * as bare issue NUMBERS. `planClumpPR` then read `member.id` off a number and
 * every commit subject in every plan came out `fix(<scope>): undefined`, over a
 * header reading "16 clumps, 66 commits, one PR each". The producer is fixed
 * too — this is the second half, and it is the half that holds for the NEXT
 * producer, including an adopter's.
 *
 * The precedent for refusing rather than degrading is in this file already: a
 * findings-only craft output exits `NO_CLUMPS_INPUT_EXIT_CODE` rather than
 * printing zero plans, because zero plans is a perfectly ordinary outcome. A
 * plan full of `undefined` is worse than either — it is a SUCCESSFUL-looking
 * plan that names no work.
 */
function clumpGap(clump: unknown, index: number): string | null {
  const where = `clumps[${index}]`;
  if (clump === null || typeof clump !== 'object' || Array.isArray(clump)) {
    return `${where} is ${describeValue(clump)}, not a clump object`;
  }
  const record = clump as Record<string, unknown>;
  for (const field of ['id', 'scope', 'kind'] as const) {
    if (typeof record[field] !== 'string') {
      return `${where}.${field} is ${describeValue(record[field])}, not a string`;
    }
  }
  if (!Array.isArray(record.members)) {
    return `${where}.members is ${describeValue(record.members)}, not an array`;
  }
  for (const [i, member] of record.members.entries()) {
    const gap = memberGap(member, `${where}.members[${i}]`);
    if (gap !== null) return gap;
  }
  return null;
}

/**
 * Extract the clump set from whatever the lane handed in.
 *
 * Three shapes are accepted because three real producers exist, and all three
 * are read from the SAME field name so a new producer needs no case here:
 *
 *   - a craft run's output (`{ findings, clumps: ClumpResult, summary }`) —
 *     `naming-craft`, `code-craft`, `security-craft` and the rest, which the
 *     MCP tools serialize whole;
 *   - `harness fleet clump-issues --json` (`{ report, conservation, clumps: [...] }`);
 *   - a bare `ClumpResult`.
 *
 * A craft output with `findings` and NO `clumps` is the one shape that must not
 * degrade quietly: it is either a pre-Phase-3 run or a lane that stripped the
 * grouped view, and in both cases the correct response is to say so. Returning
 * an empty plan list would read as "this run had nothing to group", which is a
 * perfectly ordinary and entirely different outcome.
 *
 * The field is read and then CHECKED (`clumpGap`), not cast. Shape-checking is
 * the half of this that holds for a producer that does not exist yet, and the
 * half that was missing: the cast let a dump whose members were bare issue
 * numbers through to `planClumpPR`, which printed 66 commits all subjected
 * `fix(<scope>): undefined`. A malformed payload now refuses with its own exit
 * code ({@link MALFORMED_CLUMP_INPUT_EXIT_CODE}), so it is distinguishable from
 * both a successful plan and an absent clump set.
 */
/** The whole array, or the FIRST thing wrong with it. One gap, named precisely. */
function clumpSetGap(clumps: readonly unknown[]): ClumpInputGap | null {
  for (const [index, clump] of clumps.entries()) {
    const gap = clumpGap(clump, index);
    if (gap === null) continue;
    return {
      gap:
        `the \`clumps\` field is not a dispatchable clump set — ${gap}. ` +
        'A member needs at least an `id`: it is what each commit and each verdict ' +
        'is keyed on. `harness fleet clump-issues --json` emits that shape.',
      exit: MALFORMED_CLUMP_INPUT_EXIT_CODE,
    };
  }
  return null;
}

export function extractClumps(parsed: unknown): readonly PlannableClump[] | ClumpInputGap {
  if (parsed === null || typeof parsed !== 'object') {
    return { gap: 'input is not a JSON object' };
  }
  const record = parsed as Record<string, unknown>;

  // A bare ClumpResult, a craft run's output, or clump-issues --json — all three
  // under the same field name, so a fourth producer needs no case here.
  const clumps = nestedClumps(record.clumps);
  if (clumps !== null) {
    return clumpSetGap(clumps) ?? (clumps as readonly PlannableClump[]);
  }

  if (Array.isArray(record.findings)) {
    return {
      gap:
        `input carries ${record.findings.length} findings and no \`clumps\` field. ` +
        'A craft run emits the grouped view alongside its findings (Phase 3); re-folding ' +
        'findings into targets by hand is the step this command replaces.',
    };
  }
  return { gap: 'input carries no `clumps` field' };
}

/**
 * Describe a member for its own commit subject and PR-body citation.
 *
 * Reads the native record the seam left on `ref` — core never inspects it, so
 * this is the only layer that can. Shape-sniffed rather than told which seam it
 * is, because the command's input is a JSON dump with no seam tag on it, and
 * inventing a `--seam` flag would let a lane mislabel its own output.
 *
 * `ref` is OPTIONAL and routinely absent, which is the honest typing rather
 * than a defensive one: a craft run serializes the compact `ClumpView`, whose
 * members carry an id and nothing else, so the no-`ref` path is the COMMON one
 * for a lane dispatching from a craft dump. It degrades to the item id, which
 * is always present and always identifying — and at the craft seam the id is
 * `code:path:line#ordinal`, so the citation still names the code, the file and
 * the line. It never fabricates one.
 */
export function describeMember(item: PlannableMember): { subject: string; citation: string } {
  const ref = item.ref;
  if (ref !== null && typeof ref === 'object') {
    const record = ref as Record<string, unknown>;
    // The intake seam: a GitHub issue.
    if (typeof record.number === 'number' && typeof record.title === 'string') {
      return {
        subject: record.title,
        citation: `#${record.number} — ${record.title}`,
      };
    }
    // The creation seam: a craft finding.
    const target = record.target as { file?: unknown; line?: unknown } | undefined;
    if (typeof record.code === 'string' && target && typeof target.file === 'string') {
      const where = typeof target.line === 'number' ? `${target.file}:${target.line}` : target.file;
      return { subject: `${record.code} at ${where}`, citation: `${record.code} — ${where}` };
    }
  }
  return { subject: item.id, citation: item.id };
}

/** One member's outcome as a lane reports it on disk. */
interface VerdictFileEntry {
  memberId: string;
  verified: boolean;
  reason?: string;
}

/** The verdict file: outcomes keyed by clump id, plus the post-drop build signal. */
export interface VerdictFile {
  postDropBuild?: PostDropBuild;
  clumps: Record<string, VerdictFileEntry[]>;
}

function read(source: string): string {
  return source === '-' ? fs.readFileSync(0, 'utf-8') : fs.readFileSync(source, 'utf-8');
}

function renderPlan(plan: ClumpPRPlan): string {
  return [
    chalk.bold(`${plan.clumpId}  ${chalk.cyan(plan.kind)} over ${plan.scope}`),
    `  branch   ${plan.branch}`,
    `  title    ${plan.title}`,
    `  commits  ${plan.commits.length} (one per member)`,
    ...plan.commits.map((commit, i) => `    ${String(i + 1).padStart(2)}. ${commit.subject}`),
  ].join('\n');
}

function renderVerdict(verdict: ClumpVerdict): string {
  const badge =
    verdict.status === 'verified'
      ? chalk.green('verified')
      : verdict.status === 'verified-with-drops'
        ? chalk.yellow('verified-with-drops')
        : chalk.red('failed');
  const lines = [
    `${chalk.bold(verdict.clumpId)}  ${badge}  ${verdict.remainder.length} kept, ${verdict.drops.length} dropped`,
  ];
  for (const drop of verdict.drops) {
    lines.push(`    - dropped ${drop.memberId}: ${drop.reason}`);
    lines.push(`      revert: ${drop.revertCommitSubject}`);
  }
  if (verdict.reason) lines.push(`    ${chalk.red(verdict.reason)}`);
  return lines.join('\n');
}

/** Read and parse a JSON file, naming the gap rather than returning an empty value. */
function readJson(source: string): { value: unknown } | ClumpInputGap {
  try {
    return { value: JSON.parse(read(source)) };
  } catch (error) {
    return { gap: `cannot read ${source} — ${(error as Error).message}` };
  }
}

function printPlans(plans: readonly ClumpPRPlan[], json: boolean): void {
  if (json) {
    console.log(JSON.stringify({ plans }, null, 2));
    return;
  }
  const commits = plans.reduce((n, p) => n + p.commits.length, 0);
  console.log(
    chalk.bold(
      `Clump dispatch plan — ${plans.length} clump${plans.length === 1 ? '' : 's'}, ` +
        `${commits} commits, one PR each`
    )
  );
  if (plans.length === 0) console.log(chalk.dim('  no clumps — every item stays its own lane'));
  for (const plan of plans) console.log('\n' + renderPlan(plan));
}

function printVerdicts(verdicts: readonly ClumpVerdict[], json: boolean): void {
  if (json) {
    console.log(JSON.stringify({ verdicts }, null, 2));
    return;
  }
  const dropped = verdicts.reduce((n, v) => n + v.drops.length, 0);
  console.log(
    chalk.bold(
      `Clump verdicts — ${verdicts.length} clump${verdicts.length === 1 ? '' : 's'}, ` +
        `one verdict each, ${dropped} member${dropped === 1 ? '' : 's'} dropped`
    ),
    '\n'
  );
  for (const verdict of verdicts) console.log(renderVerdict(verdict));
}

/**
 * Settle one clump, or name the gap.
 *
 * Every non-verdict path here is a REFUSAL, never a default: a clump with no
 * reported outcomes, a verdict that names a member the PR does not carry, and a
 * verdict whose members do not partition the plan each return a gap. The
 * convenient alternative in all three cases is to treat silence as a pass.
 */
function settleOne(
  plan: ClumpPRPlan,
  verdictFile: VerdictFile,
  build: PostDropBuild | undefined
): { verdict: ClumpVerdict } | { gap: string; exit: number } {
  const outcomes = verdictFile.clumps?.[plan.clumpId];
  if (outcomes === undefined) {
    return {
      gap: `no outcomes for clump ${plan.clumpId}; an unverified clump is not a verified one`,
      exit: NO_CLUMPS_INPUT_EXIT_CODE,
    };
  }
  let verdict: ClumpVerdict;
  try {
    verdict = settleClumpVerdict(
      plan,
      outcomes as readonly ClumpMemberOutcome[],
      build === undefined ? {} : { postDropBuild: build }
    );
  } catch (error) {
    return { gap: (error as Error).message, exit: VERDICT_PARTITION_BREACH_EXIT_CODE };
  }
  const partition = checkVerdictPartition(plan, verdict);
  if (!partition.holds) {
    return {
      gap: `D10 PARTITION BREACH on ${plan.clumpId} — ${partition.planned} planned, ${partition.settled} settled`,
      exit: VERDICT_PARTITION_BREACH_EXIT_CODE,
    };
  }
  return { verdict };
}

/**
 * Read the input and turn its clump set into PR plans, or name the gap.
 *
 * Both failure modes are REFUSALS with a named gap, never an empty plan list:
 * an empty list is a perfectly ordinary outcome ("this run grouped nothing"),
 * so using it to report a missing or unreadable input would make the two
 * indistinguishable from the outside.
 */
function loadPlans(options: ClumpDispatchOptions): readonly ClumpPRPlan[] | ClumpInputGap {
  const input = readJson(options.input);
  if ('gap' in input) return input;
  const clumps = extractClumps(input.value);
  if ('gap' in clumps) {
    return {
      gap:
        `no clump set to dispatch — ${clumps.gap}\n` +
        '  Nothing was planned. Pass a run whose output carries `clumps`.',
      ...(clumps.exit === undefined ? {} : { exit: clumps.exit }),
    };
  }
  return clumps.map((clump) =>
    planClumpPR(clump, {
      ...(options.commitType === undefined ? {} : { commitType: options.commitType }),
      describe: describeMember,
    })
  );
}

/** Settle every plan, or return the first gap with its exit code. */
function settleAll(
  plans: readonly ClumpPRPlan[],
  verdictFile: VerdictFile,
  build: PostDropBuild | undefined
): { verdicts: ClumpVerdict[] } | { gap: string; exit: number } {
  const verdicts: ClumpVerdict[] = [];
  for (const plan of plans) {
    const settled = settleOne(plan, verdictFile, build);
    if ('gap' in settled) return settled;
    verdicts.push(settled.verdict);
  }
  return { verdicts };
}

/**
 * Plan the PRs, and — when a verdict file is supplied — settle them.
 *
 * Returns the exit code. A `failed` clump exits non-zero, because a lane that
 * ran this and read only the pretty output would otherwise carry on with a
 * clump whose remainder does not build.
 */
export function runClumpDispatch(options: ClumpDispatchOptions): number {
  const plans = loadPlans(options);
  if ('gap' in plans) {
    console.error(chalk.yellow(`clump-dispatch: ${plans.gap}`));
    return plans.exit ?? NO_CLUMPS_INPUT_EXIT_CODE;
  }

  if (options.verdict === undefined) {
    printPlans(plans, Boolean(options.json));
    return 0;
  }

  const verdictInput = readJson(options.verdict);
  if ('gap' in verdictInput) {
    console.error(chalk.yellow(`clump-dispatch: ${verdictInput.gap}`));
    return NO_CLUMPS_INPUT_EXIT_CODE;
  }
  const verdictFile = verdictInput.value as VerdictFile;
  const settled = settleAll(plans, verdictFile, options.postDropBuild ?? verdictFile.postDropBuild);
  if ('gap' in settled) {
    console.error(chalk.red(`clump-dispatch: ${settled.gap}`));
    return settled.exit;
  }

  printVerdicts(settled.verdicts, Boolean(options.json));
  return settled.verdicts.some((v) => v.status === 'failed') ? CLUMP_FAILED_EXIT_CODE : 0;
}

export function createClumpDispatchCommand(): Command {
  return new Command('clump-dispatch')
    .description(
      'Take a CLUMP as the lane unit (fleet-family DISPATCH): read the clump set a run ' +
        'emitted and print one PR plan per clump with one commit per member. With ' +
        '--verdict, settle ONE verdict per clump under D10 — a failing member is dropped ' +
        'by reverting its own commit and the clump proceeds with the rest. Read-only.'
    )
    .requiredOption(
      '--input <file>',
      "the emitted clump set: a craft run's JSON output, a `clump-issues --json` dump, or a bare ClumpResult (`-` = stdin)"
    )
    .option('--verdict <file>', 'member outcomes per clump id; settles the D10 verdict')
    .option(
      '--post-drop-build <state>',
      'whether the tree still builds after the drops were reverted (green | red | unknown)'
    )
    .option('--commit-type <type>', 'conventional-commit type for the title and subjects', 'fix')
    .option('--json', 'emit the plans or verdicts as JSON')
    .action((opts: ClumpDispatchOptions, cmd: Command) => {
      // `--json` is also a GLOBAL option on the root program, so merge globals in
      // (a bare `harness --json fleet clump-dispatch` sets it on the parent).
      const globals = cmd.optsWithGlobals() as ClumpDispatchOptions;
      process.exitCode = runClumpDispatch({ ...opts, json: Boolean(opts.json ?? globals.json) });
    });
}
