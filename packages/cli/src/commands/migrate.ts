import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { execFileSync } from 'child_process';
import chalk from 'chalk';
import type { Result } from '@harness-engineering/core';
import { Ok, Err } from '@harness-engineering/core';
import { DEFAULT_SKIP_DIRS } from '@harness-engineering/graph';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';
import { resolveConfig } from '../config/loader';

interface MigrateOptions {
  cwd?: string | undefined;
  dryRun?: boolean | undefined;
  yes?: boolean | undefined;
  skipReferences?: boolean | undefined;
  orphanStrategy?: 'ask' | 'skip' | 'bucket' | undefined;
  orphanTopic?: string | undefined;
}

type PlanMapSource = 'autopilot' | 'header' | 'filename';
interface PlanMove {
  src: string;
  dest: string;
  topic: string;
  via: PlanMapSource | 'orphan-bucket';
  subdir: 'plans' | 'verifications';
}
interface AdrMove {
  src: string;
  dest: string;
}

interface MigrationPlan {
  cwd: string;
  isGitRepo: boolean;
  docsDir: string;
  adrMoves: AdrMove[];
  planMoves: PlanMove[];
  orphanPlans: string[];
  proposalTopics: Set<string>;
}

export interface MigrationResult {
  movesPlanned: number;
  movesApplied: number;
  movesFailed: number;
  orphansRemaining: number;
  references: { files: number; replacements: number };
  dryRun: boolean;
  cancelled: boolean;
}

function isGitRepo(cwd: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd, stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function readJson<T = unknown>(p: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

function listDirs(p: string): string[] {
  if (!fs.existsSync(p)) return [];
  return fs
    .readdirSync(p, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
}

function listFiles(p: string, predicate: (name: string) => boolean): string[] {
  if (!fs.existsSync(p)) return [];
  return fs
    .readdirSync(p, { withFileTypes: true })
    .filter((e) => e.isFile() && predicate(e.name))
    .map((e) => e.name);
}

function walk(dir: string, predicate: (p: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (DEFAULT_SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, predicate));
    else if (predicate(full)) out.push(full);
  }
  return out;
}

interface AutopilotState {
  specPath?: string;
  phases?: Array<{ planPath?: string }>;
}

function extractAutopilotTopic(state: AutopilotState): string | null {
  const match = (state.specPath ?? '').match(/^docs\/changes\/([^/]+)\/proposal\.md$/);
  return match?.[1] ?? null;
}

function buildAutopilotMap(cwd: string): Map<string, string> {
  const map = new Map<string, string>();
  const sessionsDir = path.join(cwd, '.harness', 'sessions');
  if (!fs.existsSync(sessionsDir)) return map;

  for (const session of listDirs(sessionsDir)) {
    if (!session.startsWith('changes--')) continue;
    const state = readJson<AutopilotState>(path.join(sessionsDir, session, 'autopilot-state.json'));
    if (!state) continue;
    const topic = extractAutopilotTopic(state);
    if (!topic) continue;
    for (const phase of state.phases ?? []) {
      if (phase.planPath) map.set(phase.planPath, topic);
    }
  }
  return map;
}

function extractTopicFromHeader(planAbs: string, proposalTopics: Set<string>): string | null {
  let text: string;
  try {
    text = fs.readFileSync(planAbs, 'utf8').slice(0, 4000);
  } catch {
    return null;
  }
  const patterns = [
    /docs\/changes\/([a-z0-9-]+)\/proposal\.md/i,
    /\*\*Spec[^:]*:\*\*\s*\[?[^\]]*?docs\/changes\/([a-z0-9-]+)/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m && m[1] && proposalTopics.has(m[1])) return m[1];
  }
  return null;
}

function extractTopicFromFilename(filename: string, proposalTopics: Set<string>): string | null {
  const stripped = filename
    .replace(/\.md$/, '')
    .replace(/^\d{4}-\d{2}-\d{2}-/, '')
    .replace(/-plan$/, '')
    .replace(/-phase\d+(-plan)?$/, '');
  if (proposalTopics.has(stripped)) return stripped;
  let best: string | null = null;
  for (const topic of proposalTopics) {
    const matches = stripped === topic || stripped.startsWith(`${topic}-`);
    if (matches && (!best || topic.length > best.length)) best = topic;
  }
  return best;
}

function resolveDocsDir(cwd: string): string {
  const configPath = path.join(cwd, 'harness.config.json');
  const configResult = fs.existsSync(configPath) ? resolveConfig(configPath) : null;

  let docsDir: string;
  if (configResult?.ok) {
    docsDir = configResult.value.docsDir;
  } else if (configResult && !configResult.ok) {
    docsDir = './docs';
    logger.warn(
      `  harness.config.json failed to load (${configResult.error.message}); defaulting docsDir to ./docs`
    );
  } else {
    docsDir = './docs';
  }

  const docsAbs = path.resolve(cwd, docsDir);
  const relRaw = path.relative(cwd, docsAbs).replaceAll('\\', '/');
  // Guard: when docsDir resolves to the repo root, avoid producing absolute-looking paths
  return relRaw === '' ? 'docs' : relRaw;
}

function collectAdrMoves(cwd: string, docsRel: string): AdrMove[] {
  const moves: AdrMove[] = [];
  const legacyAdrDir = path.join(cwd, '.harness', 'architecture');
  if (!fs.existsSync(legacyAdrDir)) return moves;

  for (const topic of listDirs(legacyAdrDir)) {
    const topicSrc = path.join(legacyAdrDir, topic);
    for (const file of listFiles(topicSrc, (n) => n.endsWith('.md'))) {
      moves.push({
        src: `.harness/architecture/${topic}/${file}`,
        dest: `${docsRel}/architecture/${topic}/${file}`,
      });
    }
  }
  return moves;
}

function collectProposalTopics(cwd: string): Set<string> {
  const topics = new Set<string>();
  const changesDir = path.join(cwd, 'docs', 'changes');
  for (const topic of listDirs(changesDir)) {
    if (fs.existsSync(path.join(changesDir, topic, 'proposal.md'))) {
      topics.add(topic);
    }
  }
  return topics;
}

function classifyPlan(
  planRel: string,
  planAbs: string,
  filename: string,
  autopilotMap: Map<string, string>,
  proposalTopics: Set<string>
): { topic: string; via: PlanMapSource } | null {
  const fromAutopilot = autopilotMap.get(planRel);
  if (fromAutopilot) return { topic: fromAutopilot, via: 'autopilot' };

  const fromHeader = extractTopicFromHeader(planAbs, proposalTopics);
  if (fromHeader) return { topic: fromHeader, via: 'header' };

  const fromFilename = extractTopicFromFilename(filename, proposalTopics);
  if (fromFilename) return { topic: fromFilename, via: 'filename' };

  return null;
}

async function buildPlan(opts: MigrateOptions): Promise<MigrationPlan> {
  const cwd = opts.cwd ?? process.cwd();
  const docsRel = resolveDocsDir(cwd);

  const plan: MigrationPlan = {
    cwd,
    isGitRepo: isGitRepo(cwd),
    docsDir: docsRel,
    adrMoves: collectAdrMoves(cwd, docsRel),
    planMoves: [],
    orphanPlans: [],
    proposalTopics: collectProposalTopics(cwd),
  };

  const legacyPlanDir = path.join(cwd, 'docs', 'plans');
  if (!fs.existsSync(legacyPlanDir)) return plan;

  const autopilotMap = buildAutopilotMap(cwd);
  for (const file of listFiles(legacyPlanDir, (n) => n.endsWith('.md') && n !== 'index.md')) {
    const planRel = `docs/plans/${file}`;
    const planAbs = path.join(legacyPlanDir, file);
    const subdir: 'plans' | 'verifications' = file.includes('VERIFICATION')
      ? 'verifications'
      : 'plans';

    const classified = classifyPlan(planRel, planAbs, file, autopilotMap, plan.proposalTopics);
    if (classified) {
      plan.planMoves.push({
        src: planRel,
        dest: `docs/changes/${classified.topic}/${subdir}/${file}`,
        topic: classified.topic,
        via: classified.via,
        subdir,
      });
    } else {
      plan.orphanPlans.push(planRel);
    }
  }

  return plan;
}

function gitMv(cwd: string, src: string, dest: string, useGit: boolean): void {
  const destAbs = path.join(cwd, dest);
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  if (useGit) {
    try {
      execFileSync('git', ['mv', src, dest], { cwd, stdio: 'pipe' });
      return;
    } catch {
      // fall through to plain rename
    }
  }
  fs.renameSync(path.join(cwd, src), destAbs);
}

function executeMigration(plan: MigrationPlan): { moved: number; failed: number } {
  let moved = 0;
  let failed = 0;
  const allMoves = [
    ...plan.adrMoves.map((m) => ({ src: m.src, dest: m.dest })),
    ...plan.planMoves.map((m) => ({ src: m.src, dest: m.dest })),
  ];
  for (const { src, dest } of allMoves) {
    try {
      gitMv(plan.cwd, src, dest, plan.isGitRepo);
      moved++;
    } catch (err) {
      failed++;
      logger.error(`  ${src} -> ${dest}: ${(err as Error).message}`);
    }
  }
  return { moved, failed };
}

function buildPathLookup(plan: MigrationPlan): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const m of plan.adrMoves) lookup.set(m.src, m.dest);
  for (const m of plan.planMoves) lookup.set(m.src, m.dest);
  return lookup;
}

function updateReferences(plan: MigrationPlan): { files: number; replacements: number } {
  const lookup = buildPathLookup(plan);
  if (lookup.size === 0) return { files: 0, replacements: 0 };

  let files = 0;
  let replacements = 0;

  const targets: string[] = [
    ...walk(path.join(plan.cwd, 'docs'), (p) => p.endsWith('.md')),
    ...walk(path.join(plan.cwd, '.harness', 'sessions'), (p) => p.endsWith('.json')),
  ];

  for (const target of targets) {
    let text: string;
    try {
      text = fs.readFileSync(target, 'utf8');
    } catch {
      continue;
    }
    let result = text;
    let count = 0;
    for (const [oldPath, newPath] of lookup) {
      if (!result.includes(oldPath)) continue;
      const occurrences = result.split(oldPath).length - 1;
      result = result.split(oldPath).join(newPath);
      count += occurrences;
    }
    if (count > 0 && result !== text) {
      fs.writeFileSync(target, result);
      files++;
      replacements += count;
    }
  }
  return { files, replacements };
}

async function prompt(question: string, def = 'n'): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => rl.question(question, resolve));
  rl.close();
  return (answer.trim() || def).toLowerCase();
}

async function resolveOrphans(
  plan: MigrationPlan,
  opts: MigrateOptions
): Promise<Result<{ bucketed: boolean }, CLIError>> {
  if (plan.orphanPlans.length === 0) return Ok({ bucketed: false });

  const strategy = opts.orphanStrategy ?? 'ask';

  // Dry-run never prompts. It applies non-interactive strategies (skip/bucket)
  // and shows the resulting plan without moving files.
  if (opts.dryRun && strategy === 'ask') {
    logger.info(
      `  Dry run + --orphan-strategy=ask: not prompting; ${plan.orphanPlans.length} orphan(s) would be asked about interactively.`
    );
    return Ok({ bucketed: false });
  }

  if (strategy === 'skip' || (strategy === 'ask' && !process.stdin.isTTY)) {
    logger.warn(
      `  Leaving ${plan.orphanPlans.length} orphan plan(s) in docs/plans/ (no proposal match)`
    );
    return Ok({ bucketed: false });
  }

  if (strategy === 'bucket') {
    const topic = opts.orphanTopic;
    if (!topic) {
      return Err(
        new CLIError(
          '--orphan-strategy=bucket requires --orphan-topic <name>',
          ExitCode.VALIDATION_FAILED
        )
      );
    }
    bucketOrphans(plan, topic);
    return Ok({ bucketed: true });
  }

  // strategy === 'ask' and TTY
  console.log('');
  logger.warn(`Found ${plan.orphanPlans.length} plan(s) with no matching proposal:`);
  for (const p of plan.orphanPlans.slice(0, 10)) console.log(`  - ${p}`);
  if (plan.orphanPlans.length > 10) console.log(`  ... and ${plan.orphanPlans.length - 10} more`);
  console.log('');
  console.log('  [s] skip — leave them in docs/plans/');
  console.log('  [b] bucket — move all into a single stub topic');
  const answer = await prompt('Choose [s/b]: ', 's');

  if (answer === 'b') {
    const topicAnswer = await prompt('Stub topic name (e.g., legacy-plans): ', 'legacy-plans');
    bucketOrphans(plan, topicAnswer);
    return Ok({ bucketed: true });
  }
  logger.info(`  Leaving ${plan.orphanPlans.length} orphan plan(s) in docs/plans/`);
  return Ok({ bucketed: false });
}

function bucketOrphans(plan: MigrationPlan, topic: string): void {
  for (const src of plan.orphanPlans) {
    const file = path.basename(src);
    const isVerification = file.includes('VERIFICATION');
    const subdir = isVerification ? 'verifications' : 'plans';
    plan.planMoves.push({
      src,
      dest: `docs/changes/${topic}/${subdir}/${file}`,
      topic,
      via: 'orphan-bucket',
      subdir: subdir as 'plans' | 'verifications',
    });
  }
  plan.orphanPlans = [];
}

function summarize(plan: MigrationPlan): void {
  console.log('');
  console.log(chalk.bold('  Migration plan'));
  console.log('');
  if (plan.adrMoves.length === 0 && plan.planMoves.length === 0 && plan.orphanPlans.length === 0) {
    logger.success('  Nothing to migrate. Layout is already up to date.');
    return;
  }
  if (plan.adrMoves.length > 0) {
    logger.info(
      `  ADR moves: ${plan.adrMoves.length} file(s) — .harness/architecture/ → ${plan.docsDir}/architecture/`
    );
  }
  if (plan.planMoves.length > 0) {
    const byVia = plan.planMoves.reduce<Record<string, number>>((acc, m) => {
      acc[m.via] = (acc[m.via] ?? 0) + 1;
      return acc;
    }, {});
    logger.info(
      `  Plan moves: ${plan.planMoves.length} file(s) — docs/plans/ → docs/changes/<topic>/{plans,verifications}/`
    );
    for (const [via, n] of Object.entries(byVia)) console.log(chalk.dim(`    via ${via}: ${n}`));
  }
  if (plan.orphanPlans.length > 0) {
    logger.warn(`  Orphan plans: ${plan.orphanPlans.length} (no proposal match — needs decision)`);
  }
  console.log('');
}

export async function detectLegacyArtifacts(
  cwd: string
): Promise<{ adrLegacy: boolean; planLegacy: boolean }> {
  const adrLegacyDir = path.join(cwd, '.harness', 'architecture');
  const adrLegacy = fs.existsSync(adrLegacyDir) && listDirs(adrLegacyDir).length > 0;

  const planLegacyDir = path.join(cwd, 'docs', 'plans');
  const planLegacy =
    fs.existsSync(planLegacyDir) &&
    listFiles(planLegacyDir, (n) => n.endsWith('.md') && n !== 'index.md').length > 0;

  return { adrLegacy, planLegacy };
}

async function confirmApply(opts: MigrateOptions): Promise<boolean> {
  if (opts.yes || !process.stdin.isTTY) return true;
  const answer = await prompt('Apply this migration? [y/N] ', 'n');
  return answer === 'y' || answer === 'yes';
}

interface ApplyOutcome {
  moved: number;
  failed: number;
  references: { files: number; replacements: number };
}

function applyMigration(plan: MigrationPlan, opts: MigrateOptions): ApplyOutcome {
  const { moved, failed } = executeMigration(plan);
  console.log('');
  if (failed > 0) logger.error(`  Moved ${moved} file(s); ${failed} failed.`);
  else logger.success(`  Moved ${moved} file(s).`);

  let references = { files: 0, replacements: 0 };
  if (!opts.skipReferences) {
    references = updateReferences(plan);
    if (references.replacements > 0) {
      logger.success(
        `  Updated ${references.replacements} reference(s) across ${references.files} file(s).`
      );
    } else {
      logger.info('  No reference updates needed.');
    }
  }

  return { moved, failed, references };
}

export async function runMigrate(opts: MigrateOptions): Promise<Result<MigrationResult, CLIError>> {
  const cwd = opts.cwd ?? process.cwd();
  const plan = await buildPlan({ ...opts, cwd });

  summarize(plan);

  const empty: MigrationResult = {
    movesPlanned: 0,
    movesApplied: 0,
    movesFailed: 0,
    orphansRemaining: 0,
    references: { files: 0, replacements: 0 },
    dryRun: opts.dryRun ?? false,
    cancelled: false,
  };

  if (plan.adrMoves.length === 0 && plan.planMoves.length === 0 && plan.orphanPlans.length === 0) {
    return Ok(empty);
  }

  const orphanResult = await resolveOrphans(plan, opts);
  if (!orphanResult.ok) return orphanResult;

  // Re-summarize when bucketing changed the plan composition
  if (orphanResult.value.bucketed) summarize(plan);

  const movesPlanned = plan.adrMoves.length + plan.planMoves.length;

  if (opts.dryRun) {
    logger.info('  Dry run — no files moved.');
    return Ok({ ...empty, movesPlanned, orphansRemaining: plan.orphanPlans.length });
  }

  if (!(await confirmApply(opts))) {
    logger.info('  Cancelled.');
    return Ok({ ...empty, movesPlanned, cancelled: true });
  }

  const { moved, failed, references } = applyMigration(plan, opts);

  console.log('');
  logger.info('  Next: review changes with `git status` / `git diff`, then commit.');
  return Ok({
    movesPlanned,
    movesApplied: moved,
    movesFailed: failed,
    orphansRemaining: plan.orphanPlans.length,
    references,
    dryRun: false,
    cancelled: false,
  });
}

export function createMigrateCommand(): Command {
  return new Command('migrate')
    .description('Migrate legacy harness artifact locations to current layout')
    .option('--dry-run', 'Show the migration plan without moving files', false)
    .option('--yes', 'Skip confirmation prompt', false)
    .option(
      '--skip-references',
      'Do not update path references in docs/sessions after moves',
      false
    )
    .option('--orphan-strategy <strategy>', 'How to handle orphan plans (ask|skip|bucket)', 'ask')
    .option('--orphan-topic <name>', 'Stub topic name when --orphan-strategy=bucket')
    .action(async (options) => {
      const result = await runMigrate({
        cwd: process.cwd(),
        dryRun: options.dryRun,
        yes: options.yes,
        skipReferences: options.skipReferences,
        orphanStrategy: options.orphanStrategy as MigrateOptions['orphanStrategy'],
        orphanTopic: options.orphanTopic,
      });
      if (!result.ok) {
        logger.error(result.error.message);
        process.exit(result.error.exitCode);
      }
      process.exit(result.value.movesFailed === 0 ? ExitCode.SUCCESS : ExitCode.ERROR);
    });
}
