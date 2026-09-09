import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { loadOrRebuildIndex } from '../skill/index-builder';
import { extractSignals } from '../skill/signal-extractor';
import { matchContent } from '../skill/content-matcher';
import { generateSkillsMd } from '../skill/skills-md-writer';
import { resolveConfig } from '../config/loader';
import { logger } from '../output/logger';

export interface AdviseSkillsOptions {
  specPath: string;
  cwd?: string;
  thorough?: boolean;
  top?: number;
  /**
   * Compute the recommendations but write nothing. Defaults to false — the
   * write is opt-OUT, never opt-in (#1916 / CLI-R004).
   *
   * Generating `SKILLS.md` is this advisor's advertised job, not a side effect:
   * `harness-planning/SKILL.md` instructs agents to "run the advisor inline
   * using `advise_skills` MCP tool to generate SKILLS.md", and the MCP twin
   * (`mcp/tools/advise-skills.ts`) returns the resulting `skillsPath`. Making
   * the write opt-in would break both. What was actually wrong was that the
   * write was undeclared, unguarded, and impossible to preview.
   */
  dryRun?: boolean;
}

/** Outcome of an advisory run, including what it did (or would do) to disk. */
export interface AdviseSkillsResult {
  result: ReturnType<typeof matchContent>;
  /** Where `SKILLS.md` was written — or would have been, under `dryRun`. */
  skillsMdPath: string;
  featureName: string;
  totalSkills: number;
  /** False under `dryRun`; nothing touched the filesystem. */
  written: boolean;
  /** Whether a `SKILLS.md` was already there — i.e. this run overwrites it. */
  existed: boolean;
}

function readPackageDeps(cwd: string): {
  deps: Record<string, string>;
  devDeps: Record<string, string>;
} {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) return { deps: {}, devDeps: {} };

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const deps =
      typeof pkg.dependencies === 'object' && pkg.dependencies !== null ? pkg.dependencies : {};
    const devDeps =
      typeof pkg.devDependencies === 'object' && pkg.devDependencies !== null
        ? pkg.devDependencies
        : {};
    return { deps, devDeps };
  } catch {
    return { deps: {}, devDeps: {} };
  }
}

function readSpecText(specPath: string): string {
  if (!fs.existsSync(specPath)) {
    throw new Error(`Spec not found: ${specPath}`);
  }
  return fs.readFileSync(specPath, 'utf-8');
}

function filterMatchesByTier(
  result: ReturnType<typeof matchContent>,
  top: number,
  thorough: boolean
): ReturnType<typeof matchContent> {
  const applySkills = result.matches.filter((m) => m.tier === 'apply').slice(0, top);
  const refSkills = result.matches.filter((m) => m.tier === 'reference').slice(0, top * 2);
  const considerSkills = thorough
    ? result.matches.filter((m) => m.tier === 'consider').slice(0, top)
    : [];

  return { ...result, matches: [...applySkills, ...refSkills, ...considerSkills] };
}

function extractFeatureName(specText: string, specPath: string): string {
  const titleMatch = specText.match(/^#\s+(.+)/m);
  return titleMatch?.[1] ?? path.basename(path.dirname(specPath));
}

export async function runAdviseSkills(options: AdviseSkillsOptions): Promise<AdviseSkillsResult> {
  const cwd = options.cwd ?? process.cwd();
  const specPath = path.resolve(cwd, options.specPath);
  const specText = readSpecText(specPath);

  const { deps, devDeps } = readPackageDeps(cwd);
  const signals = extractSignals(specText, deps, devDeps);

  const configResult = resolveConfig();
  const tierOverrides = configResult.ok ? configResult.value.skills?.tierOverrides : undefined;
  const index = loadOrRebuildIndex('claude-code', cwd, tierOverrides);
  const totalSkills = Object.keys(index.skills).length;

  const result = matchContent(index, signals);
  const filteredResult = filterMatchesByTier(result, options.top ?? 5, !!options.thorough);

  const featureName = extractFeatureName(specText, specPath);
  const skillsMdPath = path.join(path.dirname(specPath), 'SKILLS.md');
  const md = generateSkillsMd(featureName, filteredResult, totalSkills);
  const existed = fs.existsSync(skillsMdPath);
  const written = !options.dryRun;
  if (written) fs.writeFileSync(skillsMdPath, md, 'utf-8');

  return { result: filteredResult, skillsMdPath, featureName, totalSkills, written, existed };
}

/**
 * The line that tells the user what this run did to their disk.
 *
 * Previously a bare `Written to <path>` printed after an unconditional write,
 * which silently clobbered a hand-edited `SKILLS.md`. Both axes are now
 * explicit: whether anything was written, and whether it replaced a file that
 * was already there (#1916 / CLI-R004).
 */
function formatWriteLine(outcome: AdviseSkillsResult): string {
  const { skillsMdPath, written, existed } = outcome;
  if (!written) {
    const verb = existed ? 'overwrite' : 'create';
    return `${chalk.yellow('[dry-run]')} Nothing written. Would ${verb} ${skillsMdPath}`;
  }
  return existed ? `Overwrote existing ${skillsMdPath}` : `Written to ${skillsMdPath}`;
}

function formatOutput(outcome: AdviseSkillsResult) {
  const { featureName, result, totalSkills } = outcome;
  const apply = result.matches.filter((m) => m.tier === 'apply');
  const ref = result.matches.filter((m) => m.tier === 'reference');
  const consider = result.matches.filter((m) => m.tier === 'consider');

  const lines: string[] = [];
  lines.push(`Skill Advisor: Found ${result.matches.length} relevant skills for "${featureName}"`);
  lines.push('');

  if (apply.length > 0) {
    lines.push(chalk.green(`  Apply (${apply.length}):`));
    for (const m of apply) {
      lines.push(`    ${m.skillName}  (${m.score}) — ${m.when}`);
    }
  }

  if (ref.length > 0) {
    lines.push(chalk.blue(`  Reference (${ref.length}):`));
    for (const m of ref) {
      lines.push(`    ${m.skillName}  (${m.score}) — ${m.when}`);
    }
  }

  if (consider.length > 0) {
    lines.push(chalk.dim(`  Consider (${consider.length}):`));
    for (const m of consider) {
      lines.push(`    ${m.skillName}  (${m.score}) — ${m.when}`);
    }
  }

  lines.push('');
  lines.push(`Scanned ${totalSkills} skills in ${result.scanDuration}ms`);
  lines.push(formatWriteLine(outcome));

  return lines.join('\n');
}

export function createAdviseSkillsCommand(): Command {
  return new Command('advise-skills')
    .description(
      'Content-based skill recommendations for a spec. Writes (and overwrites) SKILLS.md next to the spec unless --dry-run.'
    )
    .requiredOption('--spec-path <path>', 'Path to the spec (proposal.md)')
    .option('--thorough', 'Include Consider tier in output')
    .option('--top <n>', 'Max skills per tier (default 5)', parseInt)
    .option(
      '--dry-run',
      'Print the recommendations without writing SKILLS.md. Default: write.',
      false
    )
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        const outcome = await runAdviseSkills({
          specPath: opts.specPath,
          thorough: opts.thorough,
          top: opts.top,
          dryRun: opts.dryRun,
        });

        if (opts.json) {
          logger.info(JSON.stringify(outcome.result, null, 2));
        } else {
          logger.info(formatOutput(outcome));
        }
      } catch (err) {
        logger.error((err as Error).message);
        process.exit(1);
      }
    });
}
