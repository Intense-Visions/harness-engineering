// packages/cli/src/commands/cleanup.ts
import { Command, Option } from 'commander';
import * as path from 'path';
import type {
  Result,
  EntropyConfig,
  DriftConfig,
  PatternConfig,
  DuplicationConfig,
  DuplicationReport,
} from '@harness-engineering/core';
import { Ok, Err, EntropyAnalyzer } from '@harness-engineering/core';
import { formatFindingsContract } from '@harness-engineering/types';
import { resolveProject } from '../config/loader';
import { OutputFormatter, OutputMode, type OutputModeType } from '../output/formatter';
import { resolveOutputMode } from '../utils/output';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';
import {
  resolveDuplicationRequest,
  describeDuplicationNotRun,
  isEntropyIssueType,
  describeUnknownIssueType,
  ENTROPY_ISSUE_TYPES,
  type EntropyIssueType,
} from '../shared/duplication-request';

type CleanupType = EntropyIssueType;

interface CleanupOptions {
  cwd?: string;
  configPath?: string;
  type?: CleanupType;
  json?: boolean;
  verbose?: boolean;
  quiet?: boolean;
}

interface CleanupResult {
  // `type` (drift category, e.g. "api-signature") and `line` mirror the fields
  // `harness ci check` emits for the same underlying drift finding, so a single
  // consumer/oracle can filter drift by category across both commands (#838).
  driftIssues: Array<{ file: string; line: number; type: string; issue: string }>;
  deadCode: Array<{ file: string; symbol?: string }>;
  patternViolations: Array<{ file: string; pattern: string; message: string }>;
  /**
   * The GATING count: drift + dead code + pattern violations.
   *
   * `createCleanupCommand` gates `process.exit` on this field and
   * `--findings-json` publishes it, so anything summed here becomes a build
   * failure somewhere. Clone classes are deliberately absent: spec decision
   * D4 / ADR 0134 (advisory first, never fail-closed). Adding
   * `duplication.classes.length` here would make
   * `harness cleanup -t duplication` exit non-zero on advisory findings — the
   * #855 fail-closed accident in a new place, decided by nobody.
   */
  totalIssues: number;
  /**
   * Which analyzers actually produced a report.
   *
   * Without it a zero cannot be told apart from a check that never ran:
   * `-t duplication` runs NO drift, dead-code or pattern analyzer, so
   * `totalIssues` is 0 by omission and the usual green-ticked
   * "Entropy issues: 0" would green-tick three checks that never happened —
   * the #1760 failure class one layer out. Derived from report presence, so
   * it cannot drift from what executed.
   */
  ran: { drift: boolean; deadCode: boolean; patterns: boolean; duplication: boolean };
  /**
   * ADVISORY clone classes, PRIORITY-descending, as reported by
   * `EntropyReport.duplication`.
   *
   * `priority` is `rank` for a plain duplicate and `rank x 2` for a
   * `partial-extraction` class, so the published order is derivable from the
   * published fields — a consumer handed a reordered list can reproduce the
   * ordering instead of taking it on trust.
   *
   * `undefined` means the detector did not run; an empty `classes` array
   * means it ran and found nothing. The two must not render alike.
   *
   * NEVER counted in `totalIssues` — see that field.
   */
  duplication?: {
    classes: Array<{
      fingerprint: string;
      tokenCount: number;
      memberCount: number;
      rank: number;
      priority: number;
      signal: 'duplicate' | 'partial-extraction';
      /** Absent, not `undefined`, unless `signal` is `'partial-extraction'`. */
      sharedImport?: string;
      members: Array<{
        file: string;
        unit: string;
        kind: string;
        startLine: number;
        endLine: number;
      }>;
    }>;
    filesScanned: number;
    /**
     * Files the detector could not read, parse or extract from.
     *
     * Carried because a scan with skips is INCOMPLETE and the operator is the
     * only one who can tell whether that matters. `packages/core`'s own
     * detector records (`duplication/index.ts:152`) that an ineligible file
     * "used to be counted NOWHERE — neither `filesScanned` nor `filesSkipped`
     * — so an operator could not tell that a scan had silently dropped
     * files", and that invisibility is how an ignore glob hid 10 of 58
     * classes. Dropping the counter one layer out re-creates exactly that
     * blindness. Core still refuses when ALL files are skipped, so total
     * failure stays loud; PARTIAL skips are what this makes visible.
     */
    filesSkipped: number;
    classesReported: number;
    classesSuppressed: number;
    classesTruncated: number;
  };
}

/**
 * Narrow `DuplicationReport` to the advisory block the command publishes.
 *
 * KEPT: the clone classes with their members, plus `filesScanned`,
 * `filesSkipped`, `classesReported`, `classesSuppressed` and
 * `classesTruncated`.
 *
 * DROPPED, and this is a real loss, not a complete projection:
 * - `byMember` — a `Map`, which `JSON.stringify` renders as `{}`, and an
 *   in-process index whose every entry is already in `classes[].members`.
 * - `collisions` and `skipErrors` — the per-item evidence arrays. The
 *   collision data is reachable through `classes[].members`; the skip
 *   evidence is NOT, so a reader learns THAT files were skipped from
 *   `filesSkipped` and not WHICH.
 * - `filesIgnored`, `skippedTruncated`, `unitsFingerprinted`,
 *   `unitsBelowMinTokens`, `collisionsObserved`, `collisionsTruncated`,
 *   `violationCount`, `infoCount` — tuning and provenance counters, omitted
 *   to keep the advisory block an operator-sized summary.
 *
 * The full 13-key `stats` block and both evidence arrays are available on the
 * MCP surface: `detect_entropy { type: "duplication", compact: false }`.
 *
 * KEPT, deliberately: `signal`, `sharedImport` and `priority`. They are not
 * tuning counters — `signal` is WHY a class outranks a larger one and
 * `sharedImport` names the module the repair imports from, so dropping them
 * would publish a reordered list whose order cannot be derived from the
 * payload. That is the same defect as hiding the ordering key, one layer out.
 */
function projectDuplication(
  duplication: DuplicationReport
): NonNullable<CleanupResult['duplication']> {
  return {
    classes: duplication.classes.map((cls) => ({
      fingerprint: cls.fingerprint,
      tokenCount: cls.tokenCount,
      memberCount: cls.members.length,
      rank: cls.rank,
      priority: cls.priority,
      signal: cls.signal,
      // Conditional spread, so a plain duplicate's JSON object is byte-for-byte
      // what Phase 3 published.
      ...(cls.sharedImport !== undefined && { sharedImport: cls.sharedImport }),
      members: cls.members.map((member) => ({
        file: member.file,
        unit: member.unit,
        kind: member.kind,
        startLine: member.startLine,
        endLine: member.endLine,
      })),
    })),
    filesScanned: duplication.stats.filesScanned,
    filesSkipped: duplication.stats.filesSkipped,
    classesReported: duplication.stats.classesReported,
    classesSuppressed: duplication.stats.classesSuppressed,
    classesTruncated: duplication.stats.classesTruncated,
  };
}

export async function runCleanup(
  options: CleanupOptions
): Promise<Result<CleanupResult, CLIError>> {
  // Typed as the wide `string` on purpose: the guard below is the only thing
  // standing between a caller-supplied value and an analyzer switch that
  // treats anything it does not recognize as "run nothing".
  const type: string = options.type ?? 'all';

  // Defense in depth behind the command's `.choices`: `runCleanup` is
  // exported and callable directly, and an unknown type otherwise falls
  // through the analyzer switch with everything off — zero issues, exit 0,
  // over nothing examined (#1760).
  if (!isEntropyIssueType(type)) {
    return Err(new CLIError(describeUnknownIssueType(type), ExitCode.VALIDATION_FAILED));
  }

  // Root the scan on the project that owns the config, not `process.cwd()`:
  // `-c` used to select the config file while the scan stayed on the current
  // directory, so pointing it at another project measured THIS tree. Same
  // split `check-arch` was fixed out of under #911 (9f322084c).
  const projectResult = resolveProject(options.configPath, options.cwd);
  if (!projectResult.ok) {
    return Err(projectResult.error);
  }
  const { config, root: cwd } = projectResult.value;

  const result: CleanupResult = {
    driftIssues: [],
    deadCode: [],
    patternViolations: [],
    totalIssues: 0,
    ran: { drift: false, deadCode: false, patterns: false, duplication: false },
  };

  const rootDir = path.resolve(cwd, config.rootDir);
  const docsDir = path.resolve(cwd, config.docsDir);

  // Build entropy config — use configured entry points or let resolveEntryPoints discover them.
  // docPaths must be glob patterns (a bare directory yields zero matches from glob).
  // Thread the project's drift config (entropy.drift) into analyze.drift so
  // ignorePatterns / checkApiSignatures etc. are honored (issue #723).
  //
  // `docPaths` needs threading separately (#1819): `buildSnapshot` reads it
  // from the TOP LEVEL of EntropyConfig, not from `analyze.drift`, so the
  // hard-coded value below stayed in force and the configured one was inert —
  // while the MCP `detect_entropy` tool honored it.
  const driftEnabled = type === 'all' || type === 'drift';
  const driftConfig = config.entropy?.drift as Partial<DriftConfig> | undefined;

  // Pattern rules come from `entropy.patterns` in harness.config.json. The
  // previous implementation hardcoded an empty rule set (`{ patterns: [] }`),
  // so `harness cleanup -t patterns` evaluated zero rules yet still reported
  // "Entropy issues: 0" and exited 0 — a pass indistinguishable from a real
  // check that found nothing (#1760). Read the configured rules instead, and
  // refuse to green-tick a patterns check that has nothing to evaluate.
  const patternsRequested = type === 'all' || type === 'patterns';
  const patternConfig = config.entropy?.patterns as PatternConfig | undefined;
  const configuredRuleCount =
    (patternConfig?.patterns?.length ?? 0) + (patternConfig?.customPatterns?.length ?? 0);
  const hasPatternRules = configuredRuleCount > 0;

  // Fail loudly when patterns is the explicitly requested check but no rules
  // are configured — an empty rule set cannot honestly report a pass (#1760).
  if (type === 'patterns' && !hasPatternRules) {
    return Err(
      new CLIError(
        'No pattern rules are configured, so `harness cleanup -t patterns` has nothing to ' +
          'evaluate. Add rules under `entropy.patterns` in harness.config.json, or run a ' +
          'different check (`-t drift`, `-t dead-code`). Refusing to report a pass over zero rules.',
        ExitCode.VALIDATION_FAILED
      )
    );
  }

  // Duplication is OPT-IN under `-t all` and always on for an explicit
  // `-t duplication` (plan decision P3). The patterns rule above is the
  // precedent: `all` runs a detector when the project gave it something to
  // do. The difference is that duplication ships working defaults, so an
  // explicit request needs no config — while `-t all` on an unconfigured
  // project must not silently add a clone scan to every cleanup run.
  // `false` disables it outright, and an explicit request then REFUSES
  // rather than reporting a clean scan that never ran (#1760).
  const duplicationRequest = resolveDuplicationRequest(
    type,
    config.entropy?.duplication as boolean | Partial<DuplicationConfig> | undefined
  );
  if (duplicationRequest.kind === 'refuse') {
    return Err(new CLIError(duplicationRequest.message, ExitCode.VALIDATION_FAILED));
  }

  const entropyConfig: EntropyConfig = {
    rootDir,
    ...(config.entropy?.entryPoints && { entryPoints: config.entropy.entryPoints }),
    // Fallback stays docsDir-derived (configurable, and #301 made it a glob).
    // It is narrower than the analyzer default, so an unconfigured project has
    // no README in the drift denominator — deliberately unchanged here, #1819.
    docPaths: driftConfig?.docPaths ?? [path.join(docsDir, '**/*.md')],
    analyze: {
      drift: driftEnabled ? (driftConfig ?? true) : false,
      deadCode: type === 'all' || type === 'dead-code',
      // Only run the pattern analyzer when real rules exist; an empty rule set
      // is a no-op that misrepresents "checked" as "passed" (#1760).
      patterns: patternsRequested && hasPatternRules && patternConfig ? patternConfig : false,
      // Spread, not `duplication: ... | false`: `analyzer.ts:194` branches on
      // the key's truthiness and an absent key is the "never requested"
      // signal the detector's own tests assert.
      ...(duplicationRequest.kind === 'run' && { duplication: duplicationRequest.analyze }),
    },
    exclude: config.entropy?.excludePatterns ?? ['**/node_modules/**', '**/*.test.ts'],
  };

  // Create analyzer and run analysis
  const analyzer = new EntropyAnalyzer(entropyConfig);
  const analysisResult = await analyzer.analyze();

  if (!analysisResult.ok) {
    return Err(
      new CLIError(`Entropy analysis failed: ${analysisResult.error.message}`, ExitCode.ERROR)
    );
  }

  const report = analysisResult.value;

  // Extract drift issues
  if (report.drift) {
    result.driftIssues = report.drift.drifts.map((d) => ({
      file: d.docFile,
      line: d.line,
      type: d.type,
      issue: `${d.issue}: ${d.details}`,
    }));
  }

  // Extract dead code
  if (report.deadCode) {
    result.deadCode = [
      ...report.deadCode.deadFiles.map((f) => ({ file: f.path })),
      ...report.deadCode.deadExports.map((e) => ({ file: e.file, symbol: e.name })),
    ];
  }

  // Extract pattern violations
  if (report.patterns) {
    result.patternViolations = report.patterns.violations.map((v) => ({
      file: v.file,
      pattern: v.pattern,
      message: v.message,
    }));
  }

  if (report.duplication) {
    result.duplication = projectDuplication(report.duplication);
  } else if (duplicationRequest.kind === 'run') {
    // "Did not run" must not render as "found nothing" (spec Phase 3 forward
    // note 3). The analyzer leaves the report undefined and records WHY —
    // `snapshot-bypassed` on a graph-fed run, `zero-files-discovered` or
    // `invalid-ignore-pattern` on a config problem. Erroring here is not a D4
    // violation: D4 forbids failing on FINDINGS, not on a detector that could
    // not execute.
    const explanation = describeDuplicationNotRun(report.analysisErrors);
    if (type === 'duplication') {
      return Err(new CLIError(explanation, ExitCode.ERROR));
    }
    logger.warn(explanation);
  }

  result.ran = {
    drift: Boolean(report.drift),
    deadCode: Boolean(report.deadCode),
    patterns: Boolean(report.patterns),
    duplication: Boolean(report.duplication),
  };

  result.totalIssues =
    result.driftIssues.length + result.deadCode.length + result.patternViolations.length;

  return Ok(result);
}

/**
 * The "Entropy issues" headline — or an honest refusal to print one.
 *
 * `totalIssues` counts drift + dead code + patterns, so a run that executed
 * none of them (`-t duplication`) has a 0 that means "not measured". Printing
 * the green-ticked summary there would report a pass over three checks that
 * never ran — #1760 one layer out.
 */
function printEntropyIssueCount(value: CleanupResult, formatter: OutputFormatter): void {
  const gatingRan = value.ran.drift || value.ran.deadCode || value.ran.patterns;
  if (!gatingRan) {
    console.log('Entropy issues: not checked (no doc-drift, dead-code or pattern analyzer ran)');
    return;
  }
  console.log(
    formatter.formatSummary('Entropy issues', value.totalIssues.toString(), value.totalIssues === 0)
  );
}

/** The doc-drift section. One printer per section keeps each branch count small. */
function printDriftSection(driftIssues: CleanupResult['driftIssues']): void {
  if (driftIssues.length === 0) return;
  console.log('\nDocumentation drift:');
  for (const issue of driftIssues) {
    console.log(`  - ${issue.file}: ${issue.issue}`);
  }
}

/** The dead-code section, capped at 10 entries. */
function printDeadCodeSection(deadCode: CleanupResult['deadCode']): void {
  if (deadCode.length === 0) return;
  console.log('\nDead code:');
  for (const item of deadCode.slice(0, 10)) {
    console.log(`  - ${item.file}${item.symbol ? `: ${item.symbol}` : ''}`);
  }
  if (deadCode.length > 10) {
    console.log(`  ... and ${deadCode.length - 10} more`);
  }
}

/** The pattern-violation section, capped at 10 entries. */
function printPatternSection(patternViolations: CleanupResult['patternViolations']): void {
  if (patternViolations.length === 0) return;
  console.log('\nPattern violations:');
  for (const violation of patternViolations.slice(0, 10)) {
    console.log(`  - ${violation.file} [${violation.pattern}]: ${violation.message}`);
  }
  if (patternViolations.length > 10) {
    console.log(`  ... and ${patternViolations.length - 10} more`);
  }
}

/** How many clone rows the text report prints before summarizing the rest. */
const PRINTED_CLASSES = 10;

/**
 * The `[partial-extraction -> key]` tag for a row that has one, else `''`.
 *
 * The signal is what makes a row jump the size ordering, so a row that jumped
 * says why. Without it the printed order is unexplainable from the printed
 * text — the operator sees a 3x62 class above a 3x103 one and no reason for it.
 *
 * Keyed on `signal` ALONE. The previous form also required
 * `sharedImport !== undefined`, which is implied (the core sets the signal only
 * when it has a key) — so the second condition could never fire, and if the
 * invariant ever broke, a labelled class would have printed UNTAGGED, which is
 * the one outcome that leaves the ordering unexplained. It now says so loudly
 * instead.
 */
function signalSuffix(cls: NonNullable<CleanupResult['duplication']>['classes'][number]): string {
  if (cls.signal !== 'partial-extraction') return '';
  return ` [partial-extraction -> ${cls.sharedImport ?? '(no shared module recorded)'}]`;
}

/**
 * The counts line.
 *
 * `labelled partial-extraction` is published here because it is the one integer
 * that tells an operator how much of the page is CHEAPER work: a labelled row's
 * members already CALL INTO the named module, so the repair is bounded by that
 * module rather than greenfield. It is NOT necessarily a delete-and-import —
 * open the module and confirm what it exports first. The per-row tag says which
 * rows, but only for the ten that print; the count is over every reported
 * class.
 */
function duplicationHeadline(duplication: NonNullable<CleanupResult['duplication']>): string {
  const labelled = duplication.classes.filter((cls) => cls.signal === 'partial-extraction').length;
  return (
    `  ${duplication.classesReported} clone class(es) over ${duplication.filesScanned} scanned file(s); ` +
    `${labelled} labelled partial-extraction; ` +
    `${duplication.classesSuppressed} below the minInstances bar` +
    (duplication.classesTruncated > 0
      ? `; ${duplication.classesTruncated} dropped by the maxClasses cap`
      : '') +
    // A partial skip makes the scan INCOMPLETE, and this line is the only
    // place the CLI can say so — see `CleanupResult.duplication.filesSkipped`.
    (duplication.filesSkipped > 0 ? `; ${duplication.filesSkipped} file(s) skipped` : '')
  );
}

/**
 * One printed row.
 *
 * The row names ONE site but the job is collapsing all N, so it says how many
 * more there are. `memberCount` and not `members.length`: the two agree in the
 * shipped projection, and `memberCount` is the field that stays correct if a
 * caller ever hands this an abridged member list.
 */
function duplicationRow(cls: NonNullable<CleanupResult['duplication']>['classes'][number]): string {
  const first = cls.members[0];
  if (first === undefined) {
    return `  - ${cls.memberCount}x ${cls.tokenCount} tokens: (no members)${signalSuffix(cls)}`;
  }
  const more = cls.memberCount > 1 ? `, +${cls.memberCount - 1} more sites` : '';
  return (
    `  - ${cls.memberCount}x ${cls.tokenCount} tokens: ` +
    `${first.unit} (${first.file}:${first.startLine}${more})${signalSuffix(cls)}`
  );
}

/**
 * The largest class by `rank`, when the printed rows do not already carry it.
 *
 * The page is ordered by `priority`, so the biggest duplication in the project
 * can be pushed off it by smaller labelled classes — and "biggest" is the one
 * figure an operator scanning for a headline wants. One line the cap cannot
 * push off. Omitted when it would be redundant, which is the common case.
 */
function largestClassLine(
  duplication: NonNullable<CleanupResult['duplication']>
): string | undefined {
  const printed = duplication.classes.slice(0, PRINTED_CLASSES);
  const largest = duplication.classes.reduce<
    NonNullable<CleanupResult['duplication']>['classes'][number] | undefined
  >((max, cls) => (max === undefined || cls.rank > max.rank ? cls : max), undefined);
  if (largest === undefined || printed.includes(largest)) return undefined;
  return `  largest by rank (${largest.rank}), below the printed rows:\n${duplicationRow(largest)}`;
}

/** The advisory clone-class section, kept out of `printCleanupResult`'s branch count. */
function printDuplicationSection(duplication: NonNullable<CleanupResult['duplication']>): void {
  console.log(
    '\nDuplication (advisory — excluded from "Entropy issues", from the exit code and from --findings-json):'
  );
  console.log(duplicationHeadline(duplication));
  for (const cls of duplication.classes.slice(0, PRINTED_CLASSES)) {
    console.log(duplicationRow(cls));
  }
  if (duplication.classes.length > PRINTED_CLASSES) {
    console.log(`  ... and ${duplication.classes.length - PRINTED_CLASSES} more`);
  }
  const largest = largestClassLine(duplication);
  if (largest !== undefined) console.log(largest);
}

/**
 * Exported for `tests/commands/cleanup-duplication.test.ts`, which asserts
 * that a run with no gating analyzer does NOT print a green-ticked
 * "Entropy issues: 0". The command action is the only other caller.
 */
export function printCleanupResult(value: CleanupResult, formatter: OutputFormatter): void {
  printEntropyIssueCount(value, formatter);
  printDriftSection(value.driftIssues);
  printDeadCodeSection(value.deadCode);
  printPatternSection(value.patternViolations);
  if (value.duplication) {
    printDuplicationSection(value.duplication);
  }
}

/**
 * The `-t, --type` option.
 *
 * `.choices` and not a bare `.option`: an unrecognized value used to run no
 * analyzer and exit 0 (see `describeUnknownIssueType`). Commander refuses
 * before the action runs, so no findings line is published either. Hoisted out
 * of `createCleanupCommand` to keep that function under the arch
 * function-length threshold.
 */
function typeOption(): Option {
  return new Option('-t, --type <type>', `Issue type: ${ENTROPY_ISSUE_TYPES.join(', ')}`)
    .choices([...ENTROPY_ISSUE_TYPES])
    .default('all');
}

/**
 * Whether the human-readable result is printed in the current output mode.
 *
 * `--quiet` suppresses a clean run and shows a dirty one. "Dirty" used to mean
 * `totalIssues > 0` alone — but `totalIssues` deliberately EXCLUDES duplication
 * (D4 / ADR 0134), so the quiet gate suppressed the entire advisory channel
 * this phase added: measured, `-t duplication --quiet` printed NOTHING and
 * exited 0 with a clone class found. That was an unintended reach of the D4
 * exclusion, not a decision anyone made.
 */
function shouldPrint(mode: OutputModeType, value: CleanupResult): boolean {
  if (mode !== OutputMode.QUIET) return true;
  return value.totalIssues > 0 || value.duplication !== undefined;
}

const CLEANUP_DESCRIPTION =
  'Detect entropy issues (doc drift, dead code, patterns, duplication). Duplication is ' +
  'advisory — it never affects the exit code — and under --type all it runs only when ' +
  'entropy.duplication is configured in harness.config.json.';

export function createCleanupCommand(): Command {
  const command = new Command('cleanup')
    .description(CLEANUP_DESCRIPTION)
    .addOption(typeOption())
    .option(
      '--findings-json',
      'Emit the machine-readable maintenance findings contract ({ findings: N }) as a trailing stdout line (#691)'
    )
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode = resolveOutputMode(globalOpts);
      const formatter = new OutputFormatter(mode);

      const result = await runCleanup({
        configPath: globalOpts.config,
        type: opts.type as CleanupType,
        json: globalOpts.json,
        verbose: globalOpts.verbose,
        quiet: globalOpts.quiet,
      });

      if (!result.ok) {
        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify({ error: result.error.message }));
        } else {
          logger.error(result.error.message);
        }
        process.exit(result.error.exitCode);
      }

      if (mode === OutputMode.JSON) {
        console.log(JSON.stringify(result.value, null, 2));
      } else if (shouldPrint(mode, result.value)) {
        printCleanupResult(result.value, formatter);
      }

      // #691: findings = total GATING entropy issues (drift + dead code +
      // patterns). Clone classes are advisory (D4 / ADR 0134) and excluded:
      // a consumer gating on `findings > 0` would otherwise fail a build on
      // duplication, which is the exit-code hazard by another route.
      if (opts.findingsJson) {
        console.log(formatFindingsContract(result.value.totalIssues, 'cleanup'));
      }

      process.exit(result.value.totalIssues === 0 ? ExitCode.SUCCESS : ExitCode.VALIDATION_FAILED);
    });

  return command;
}
