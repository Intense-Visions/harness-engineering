import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import chalk from 'chalk';
import { loadOrRebuildIndex } from '../skill/index-builder.js';
import { extractSignals } from '../skill/signal-extractor.js';
import { matchContent } from '../skill/content-matcher.js';
import { generateSkillsMd } from '../skill/skills-md-writer.js';
import { resolveConfig } from '../config/loader.js';
import { logger } from '../output/logger.js';

export interface AdviseSkillsOptions {
  specPath: string;
  cwd?: string;
  thorough?: boolean;
  top?: number;
}

export async function runAdviseSkills(options: AdviseSkillsOptions) {
  const cwd = options.cwd ?? process.cwd();
  const specPath = path.resolve(cwd, options.specPath);

  if (!fs.existsSync(specPath)) {
    throw new Error(`Spec not found: ${specPath}`);
  }

  const specText = fs.readFileSync(specPath, 'utf-8');

  // Detect stack from package.json
  let deps: Record<string, string> = {};
  let devDeps: Record<string, string> = {};
  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    deps = pkg.dependencies ?? {};
    devDeps = pkg.devDependencies ?? {};
  }

  const signals = extractSignals(specText, deps, devDeps);

  // Load skill index
  const configResult = resolveConfig();
  const tierOverrides = configResult.ok ? configResult.value.skills?.tierOverrides : undefined;
  const index = loadOrRebuildIndex('claude-code', cwd, tierOverrides);
  const totalSkills = Object.keys(index.skills).length;

  const result = matchContent(index, signals);

  // Filter by top
  const top = options.top ?? 5;
  const applySkills = result.matches.filter((m) => m.tier === 'apply').slice(0, top);
  const refSkills = result.matches.filter((m) => m.tier === 'reference').slice(0, top * 2);
  const considerSkills = options.thorough
    ? result.matches.filter((m) => m.tier === 'consider').slice(0, top)
    : [];

  const filteredResult = {
    ...result,
    matches: [...applySkills, ...refSkills, ...considerSkills],
  };

  // Extract feature name from spec
  const titleMatch = specText.match(/^#\s+(.+)/m);
  const featureName = titleMatch?.[1] ?? path.basename(path.dirname(specPath));

  // Write SKILLS.md alongside spec
  const skillsMdPath = path.join(path.dirname(specPath), 'SKILLS.md');
  const md = generateSkillsMd(featureName, filteredResult, totalSkills);
  fs.writeFileSync(skillsMdPath, md, 'utf-8');

  return { result: filteredResult, skillsMdPath, featureName, totalSkills };
}

function formatOutput(
  featureName: string,
  result: ReturnType<typeof matchContent>,
  skillsMdPath: string,
  totalSkills: number
) {
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
  lines.push(`Written to ${skillsMdPath}`);

  return lines.join('\n');
}

export function createAdviseSkillsCommand(): Command {
  return new Command('advise-skills')
    .description('Content-based skill recommendations for a spec')
    .requiredOption('--spec-path <path>', 'Path to the spec (proposal.md)')
    .option('--thorough', 'Include Consider tier in output')
    .option('--top <n>', 'Max skills per tier (default 5)', parseInt)
    .option('--json', 'Output as JSON')
    .action(async (opts) => {
      try {
        const { result, skillsMdPath, featureName, totalSkills } = await runAdviseSkills({
          specPath: opts.specPath,
          thorough: opts.thorough,
          top: opts.top,
        });

        if (opts.json) {
          logger.info(JSON.stringify(result, null, 2));
        } else {
          logger.info(formatOutput(featureName, result, skillsMdPath, totalSkills));
        }
      } catch (err) {
        logger.error((err as Error).message);
        process.exit(1);
      }
    });
}
