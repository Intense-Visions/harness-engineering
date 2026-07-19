import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import {
  FlightRecorder,
  type RunRecord,
  type UnitVerdict,
} from '@harness-engineering/orchestrator';
import { logger } from '../output/logger';

/**
 * `harness orchestrator black-box` — read back the durable per-run forensic
 * records the orchestrator writes (see FlightRecorder). `list` enumerates runs
 * newest-first; `show <runId>` renders provenance, per-unit verdicts + gate
 * reasons (convergence), and actual tool-use aggregated from the run's streams.
 *
 * Default location is `.harness/black-box` (the recorder writes to
 * `<workspace.root>/../black-box`, and the default workspace root is
 * `.harness/workspaces`). Override with `--dir`.
 */

const DEFAULT_DIR = '.harness/black-box';

function verdictSummary(units: Record<string, UnitVerdict>): string {
  const counts = new Map<string, number>();
  for (const u of Object.values(units)) counts.set(u.verdict, (counts.get(u.verdict) ?? 0) + 1);
  return [...counts.entries()].map(([v, n]) => `${n} ${v}`).join(', ') || '—';
}

function shortSha(sha: string | null): string {
  return sha ? sha.slice(0, 7) : '—';
}

/** The tool name of a `tool_execution_start` stream line, or null for anything else. */
function toolStartSubtype(line: string): string | null {
  if (!line) return null;
  try {
    // harness-ignore SEC-DES-001: reading self-written stream jsonl — trusted internal source
    const ev = JSON.parse(line) as { type?: string; subtype?: string };
    return ev.type === 'tool_execution_start' ? (ev.subtype ?? '?') : null;
  } catch {
    return null;
  }
}

function countToolStartsInFile(file: string, counts: Map<string, number>): void {
  let lines: string[];
  try {
    lines = fs.readFileSync(file, 'utf-8').split('\n');
  } catch {
    return;
  }
  for (const line of lines) {
    const name = toolStartSubtype(line);
    if (name !== null) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
}

/** Count tool calls for a unit from its raw recording streams (`tool_execution_start.subtype`). */
function toolUseForUnit(streamsDir: string, issueId: string): Map<string, number> {
  const counts = new Map<string, number>();
  const dir = path.join(streamsDir, issueId);
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
  } catch {
    return counts;
  }
  for (const file of files) countToolStartsInFile(path.join(dir, file), counts);
  return counts;
}

function renderList(dir: string): void {
  const runs = FlightRecorder.listRuns(dir);
  if (runs.length === 0) {
    logger.info(`No black-box runs found under ${dir}`);
    return;
  }
  logger.info(`RUN                        STARTED               GIT      UNITS  VERDICTS`);
  for (const r of runs) {
    const started = r.startedAt.replace('T', ' ').slice(0, 16);
    const nUnits = Object.keys(r.units).length;
    logger.info(
      `${r.runId.padEnd(26)} ${started.padEnd(21)} ${shortSha(r.provenance.gitHead).padEnd(8)} ${String(nUnits).padEnd(6)} ${verdictSummary(r.units)}`
    );
  }
}

function renderShow(dir: string, runId: string): boolean {
  const run = FlightRecorder.getRun(dir, runId);
  if (run === null) {
    logger.error(`No black-box run '${runId}' under ${dir}`);
    return false;
  }
  const streamsDir = path.join(dir, '..', 'streams');
  renderRunHeader(run);
  renderUnits(run, streamsDir);
  return true;
}

const orDash = (v: string | null | undefined): string => v ?? '—';

function fmtModes(modes: Record<string, string> | undefined): string {
  if (!modes) return '';
  return Object.entries(modes)
    .map(([k, v]) => `${k}:${v}`)
    .join(',');
}

function renderRunHeader(run: RunRecord): void {
  const p = run.provenance;
  logger.info(`Run ${run.runId}  (${orDash(run.orchestratorId)})`);
  logger.info(
    `  started: ${run.startedAt}   ended: ${run.endedAt ?? '(still running / not sealed)'}`
  );
  logger.info(
    `  git:     ${shortSha(p.gitHead)} "${p.gitSubject ?? ''}"  (branch ${orDash(p.branch)})`
  );
  logger.info(`  node:    ${p.node}   harness: ${orDash(p.harnessVersion)}`);
  logger.info(`  backends:`);
  for (const b of p.backends) {
    const extra = [b.model, b.endpoint].filter(Boolean).join('   ');
    logger.info(`    ${b.name.padEnd(10)} ${b.type.padEnd(8)} ${extra}`);
  }
  logger.info(
    `  routing: default=${orDash(p.routing.default)}  modes={${fmtModes(p.routing.modes)}}`
  );
}

function renderUnits(run: RunRecord, streamsDir: string): void {
  logger.info(``);
  logger.info(`Units:`);
  for (const u of Object.values(run.units)) {
    logger.info(
      `  ${u.identifier}  [${u.verdict}]  attempt ${u.attempt ?? '—'}  gate-blocks ${u.gateBlocks}${u.pr ? `  PR #${u.pr}` : ''}`
    );
    if (u.gateReason) {
      const firstLines = u.gateReason.split('\n').slice(0, 4).join('\n           ');
      logger.info(`    gate reason: ${firstLines}`);
    }
    const tools = toolUseForUnit(streamsDir, u.issueId);
    if (tools.size > 0) {
      const rendered = [...tools.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([n, c]) => `${n} x${c}`)
        .join(', ');
      logger.info(`    tools: ${rendered}`);
    }
  }
}

export function createBlackBoxCommand(): Command {
  const cmd = new Command('black-box').description(
    'Inspect durable per-run orchestrator flight records (provenance, verdicts, tool-use)'
  );

  cmd
    .command('list')
    .description('List recorded runs, newest first')
    .option('--dir <path>', 'Black-box directory', DEFAULT_DIR)
    .action((opts: { dir: string }) => {
      renderList(path.resolve(process.cwd(), opts.dir));
    });

  cmd
    .command('show <runId>')
    .description('Show provenance, verdicts, convergence, and tool-use for a run')
    .option('--dir <path>', 'Black-box directory', DEFAULT_DIR)
    .action((runId: string, opts: { dir: string }) => {
      const ok = renderShow(path.resolve(process.cwd(), opts.dir), runId);
      if (!ok) process.exitCode = 1;
    });

  return cmd;
}
