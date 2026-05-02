import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { execSync } from 'child_process';
import chalk from 'chalk';
import { logger } from '../output/logger';
import { ExitCode } from '../utils/errors';
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

function isGitRepo(cwd: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', { cwd, stdio: 'pipe' });
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
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, predicate));
    else if (predicate(full)) out.push(full);
  }
  return out;
}

function buildAutopilotMap(cwd: string): Map<string, string> {
  const map = new Map<string, string>();
  const sessionsDir = path.join(cwd, '.harness', 'sessions');
  if (!fs.existsSync(sessionsDir)) return map;

  for (const session of listDirs(sessionsDir)) {
    if (!session.startsWith('changes--')) continue;
    const statePath = path.join(sessionsDir, session, 'autopilot-state.json');
    const state = readJson<{ specPath?: string; phases?: Array<{ planPath?: string }> }>(statePath);
    if (!state) continue;
    const specMatch = (state.specPath ?? '').match(/^docs\/changes\/([^/]+)\/proposal\.md$/);
    if (!specMatch || !specMatch[1]) continue;
    const topic = specMatch[1];
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
    if (stripped.startsWith(topic) && (!best || topic.length > best.length)) best = topic;
  }
  return best;
}

async function buildPlan(opts: MigrateOptions): Promise<MigrationPlan> {
  const cwd = opts.cwd ?? process.cwd();
  const configResult = resolveConfig();
  const docsDir = configResult.ok ? configResult.value.docsDir : './docs';
  const docsAbs = path.resolve(cwd, docsDir);
  const docsRel = path.relative(cwd, docsAbs).replaceAll('\\', '/');

  const plan: MigrationPlan = {
    cwd,
    isGitRepo: isGitRepo(cwd),
    docsDir: docsRel,
    adrMoves: [],
    planMoves: [],
    orphanPlans: [],
    proposalTopics: new Set(),
  };

  // ADR detection
  const legacyAdrDir = path.join(cwd, '.harness', 'architecture');
  if (fs.existsSync(legacyAdrDir)) {
    for (const topic of listDirs(legacyAdrDir)) {
      const topicSrc = path.join(legacyAdrDir, topic);
      for (const file of listFiles(topicSrc, (n) => n.endsWith('.md'))) {
        const src = `.harness/architecture/${topic}/${file}`;
        const dest = `${docsRel}/architecture/${topic}/${file}`;
        plan.adrMoves.push({ src, dest });
      }
    }
  }

  // Plan detection
  const legacyPlanDir = path.join(cwd, 'docs', 'plans');
  const changesDir = path.join(cwd, 'docs', 'changes');
  for (const topic of listDirs(changesDir)) {
    if (fs.existsSync(path.join(changesDir, topic, 'proposal.md'))) {
      plan.proposalTopics.add(topic);
    }
  }

  if (fs.existsSync(legacyPlanDir)) {
    const autopilotMap = buildAutopilotMap(cwd);
    for (const file of listFiles(legacyPlanDir, (n) => n.endsWith('.md') && n !== 'index.md')) {
      const planRel = `docs/plans/${file}`;
      const planAbs = path.join(legacyPlanDir, file);
      const isVerification = file.includes('VERIFICATION');
      const subdir: 'plans' | 'verifications' = isVerification ? 'verifications' : 'plans';

      let topic: string | null = null;
      let via: PlanMapSource | null = null;

      const fromAutopilot = autopilotMap.get(planRel);
      if (fromAutopilot) {
        topic = fromAutopilot;
        via = 'autopilot';
      } else {
        const fromHeader = extractTopicFromHeader(planAbs, plan.proposalTopics);
        if (fromHeader) {
          topic = fromHeader;
          via = 'header';
        } else {
          const fromFilename = extractTopicFromFilename(file, plan.proposalTopics);
          if (fromFilename) {
            topic = fromFilename;
            via = 'filename';
          }
        }
      }

      if (topic && via) {
        plan.planMoves.push({
          src: planRel,
          dest: `docs/changes/${topic}/${subdir}/${file}`,
          topic,
          via,
          subdir,
        });
      } else {
        plan.orphanPlans.push(planRel);
      }
    }
  }

  return plan;
}

function gitMv(cwd: string, src: string, dest: string, useGit: boolean): void {
  const destAbs = path.join(cwd, dest);
  fs.mkdirSync(path.dirname(destAbs), { recursive: true });
  if (useGit) {
    try {
      execSync(`git mv "${src}" "${dest}"`, { cwd, stdio: 'pipe' });
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

async function resolveOrphans(plan: MigrationPlan, opts: MigrateOptions): Promise<void> {
  if (plan.orphanPlans.length === 0) return;

  const strategy = opts.orphanStrategy ?? 'ask';

  if (strategy === 'skip' || (strategy === 'ask' && !process.stdin.isTTY)) {
    logger.warn(
      `  Leaving ${plan.orphanPlans.length} orphan plan(s) in docs/plans/ (no proposal match)`
    );
    return;
  }

  if (strategy === 'bucket') {
    const topic = opts.orphanTopic;
    if (!topic) {
      logger.error('--orphan-strategy=bucket requires --orphan-topic <name>');
      throw new Error('orphan topic required');
    }
    bucketOrphans(plan, topic);
    return;
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
  } else {
    logger.info(`  Leaving ${plan.orphanPlans.length} orphan plan(s) in docs/plans/`);
  }
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

export async function runMigrate(opts: MigrateOptions): Promise<number> {
  const cwd = opts.cwd ?? process.cwd();
  const plan = await buildPlan({ ...opts, cwd });

  summarize(plan);

  if (plan.adrMoves.length === 0 && plan.planMoves.length === 0 && plan.orphanPlans.length === 0) {
    return ExitCode.SUCCESS;
  }

  await resolveOrphans(plan, opts);

  if (opts.dryRun) {
    logger.info('  Dry run — no files moved.');
    return ExitCode.SUCCESS;
  }

  if (!opts.yes && process.stdin.isTTY) {
    const answer = await prompt('Apply this migration? [y/N] ', 'n');
    if (answer !== 'y' && answer !== 'yes') {
      logger.info('  Cancelled.');
      return ExitCode.SUCCESS;
    }
  }

  const { moved, failed } = executeMigration(plan);
  console.log('');
  if (failed > 0) logger.error(`  Moved ${moved} file(s); ${failed} failed.`);
  else logger.success(`  Moved ${moved} file(s).`);

  if (!opts.skipReferences) {
    const refs = updateReferences(plan);
    if (refs.replacements > 0) {
      logger.success(`  Updated ${refs.replacements} reference(s) across ${refs.files} file(s).`);
    } else {
      logger.info('  No reference updates needed.');
    }
  }

  console.log('');
  logger.info('  Next: review changes with `git status` / `git diff`, then commit.');
  return failed === 0 ? ExitCode.SUCCESS : ExitCode.ERROR;
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
      const code = await runMigrate({
        cwd: process.cwd(),
        dryRun: options.dryRun,
        yes: options.yes,
        skipReferences: options.skipReferences,
        orphanStrategy: options.orphanStrategy as MigrateOptions['orphanStrategy'],
        orphanTopic: options.orphanTopic,
      });
      process.exit(code);
    });
}
