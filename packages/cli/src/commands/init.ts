import { Command, type OptionValues } from 'commander';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import type { Result, RoadmapMeta } from '@harness-engineering/core';
import { Ok, Err, serializeMeta, roadmapSourceExists } from '@harness-engineering/core';
import { TemplateEngine, isAddOnTemplate, type DetectedFramework } from '../templates/engine';
import type { TemplateMetadata } from '../templates/schema';
import { resolveNamedTemplateVars } from '../templates/named-template-vars';
import {
  persistToolingConfig,
  appendFrameworkAgents,
  ensureHarnessGitignore,
  ensureComprehensionSearchIgnore,
  applyEcosystemAfterCreate,
} from '../templates/post-write';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';
import { resolveTemplatesDir } from '../utils/paths';
import { setupMcp } from './setup-mcp';
import { generateCIConfig } from './ci/init';
import {
  configureMergeOursDriver,
  configureComprehensionMergeDriver,
} from '../git/merge-driver-setup';
import { runMinimalInit, printMinimalInitSuccess } from './init-minimal';
import { TIER_LEVELS, decideReinit, writeUpgradedConfig } from './init-tier';

interface InitOptions {
  cwd?: string;
  name?: string;
  level?: string;
  framework?: string;
  language?: string;
  force?: boolean;
  /**
   * The tier the caller explicitly asked for (`--tier`, or an explicit
   * `--level`). Only an explicit request can layer on top of an existing
   * lower-tier install (#2630); without it a re-run is refused as before.
   */
  tier?: string;
}

interface InitResult {
  filesCreated: string[];
  skippedConfigs: string[];
  /** Files init left untouched because they already existed (no `--force`). */
  skippedExisting?: string[];
  detectedFrameworks?: DetectedFramework[];
  /** Set when this run layered a higher tier over an existing install. */
  upgradedFrom?: string;
}

/** An additive re-run over a lower-tier install: the config as the adopter left it. */
interface TierUpgrade {
  from: string;
  to: string;
  original: Record<string, unknown>;
}

function loadEngineAndTemplates(_options: InitOptions): {
  engine: TemplateEngine;
  templateList: TemplateMetadata[];
} {
  const engine = new TemplateEngine(resolveTemplatesDir());
  const templates = engine.listTemplates();
  const templateList = templates.ok ? templates.value : [];
  return { engine, templateList };
}

function resolveInitDefaults(options: InitOptions): { cwd: string; name: string; force: boolean } {
  const cwd = options.cwd ?? process.cwd();
  return { cwd, name: options.name ?? path.basename(cwd), force: options.force ?? false };
}

export async function runInit(options: InitOptions): Promise<Result<InitResult, CLIError>> {
  const { cwd, name, force } = resolveInitDefaults(options);

  const configPath = path.join(cwd, 'harness.config.json');
  let upgrade: TierUpgrade | undefined;
  if (!force && fs.existsSync(configPath)) {
    const decision = decideReinit(configPath, options.tier);
    if (decision.kind === 'refuse') return Err(new CLIError(decision.message, ExitCode.ERROR));
    upgrade = {
      from: decision.from,
      to: decision.to,
      original: JSON.parse(fs.readFileSync(configPath, 'utf-8')) as Record<string, unknown>,
    };
  }

  const { engine, templateList } = loadEngineAndTemplates(options);

  const validationError = validateFrameworkLanguage(options, templateList);
  if (validationError) return Err(validationError);

  const detected = upgrade ? null : tryAutoDetect(engine, cwd, options);
  if (detected) return Ok(detected);

  const language = resolveLanguage(options, templateList);
  return scaffoldProject(engine, { cwd, name, force, language, options, upgrade });
}

function validateFrameworkLanguage(
  options: InitOptions,
  templateList: TemplateMetadata[]
): CLIError | null {
  if (!options.framework || !options.language) return null;
  const fwTemplate = templateList.find((t) => t.framework === options.framework);
  if (fwTemplate?.language && fwTemplate.language !== options.language) {
    return new CLIError(
      `Framework "${options.framework}" is a ${fwTemplate.language} framework, but --language ${options.language} was specified. Remove --language or use --language ${fwTemplate.language}.`,
      ExitCode.ERROR
    );
  }
  return null;
}

function tryAutoDetect(
  engine: TemplateEngine,
  cwd: string,
  options: InitOptions
): InitResult | null {
  if (options.framework || options.language) return null;
  const detectResult = engine.detectFramework(cwd);
  if (detectResult.ok && detectResult.value.length > 0) {
    return { filesCreated: [], skippedConfigs: [], detectedFrameworks: detectResult.value };
  }
  return null;
}

function resolveLanguage(
  options: InitOptions,
  templateList: TemplateMetadata[]
): string | undefined {
  if (options.language) return options.language;
  if (options.framework) {
    const fwTemplate = templateList.find((t) => t.framework === options.framework);
    if (fwTemplate?.language) return fwTemplate.language;
  }
  return undefined;
}

async function scaffoldProject(
  engine: TemplateEngine,
  ctx: {
    cwd: string;
    name: string;
    force: boolean;
    language: string | undefined;
    options: InitOptions;
    upgrade?: TierUpgrade | undefined;
  }
): Promise<Result<InitResult, CLIError>> {
  const { cwd, name, force, language, options, upgrade } = ctx;
  const isNonJs = language && language !== 'typescript';
  const level = isNonJs ? undefined : (options.level ?? 'load-bearing-minimum');
  if (upgrade && level !== upgrade.to) {
    return Err(
      new CLIError(
        `Cannot layer tier "${upgrade.to}" over the existing "${upgrade.from}" install: ` +
          'tier upgrades apply to the TypeScript adoption ladder only. Use --force to overwrite.',
        ExitCode.ERROR
      )
    );
  }

  const resolveResult = engine.resolveTemplate(level, options.framework, language);
  if (!resolveResult.ok) return Err(new CLIError(resolveResult.error.message, ExitCode.ERROR));

  const renderResult = engine.render(resolveResult.value, {
    projectName: name,
    level: level ?? '',
    // Defaults for named-template variables (the ci-* workflows). Handlebars
    // compiles in strict mode, so these must be present for any template that
    // references them; templates that don't simply ignore them. Shared with the
    // init_project MCP tool so the two entry points can't drift (#2630).
    // Adopters edit the rendered workflow to change runner/block-on/base branch.
    ...resolveNamedTemplateVars(),
    ...(options.framework !== undefined && { framework: options.framework }),
    ...(language !== undefined && { language }),
  });
  if (!renderResult.ok) return Err(new CLIError(renderResult.error.message, ExitCode.ERROR));

  // Inject the GitHub Actions CI workflow into the write set via the single
  // generator (generateCIConfig). It is classified as a harness-managed file
  // (engine.ts HARNESS_CONFIG_FILES), so engine.write emits it in both fresh
  // and existing-project mode and skips it when a workflow already exists.
  const ciResult = generateCIConfig({
    platform: 'github',
    ...(language !== undefined && { language }),
  });
  if (ciResult.ok) {
    renderResult.value.files.push({
      relativePath: ciResult.value.filename,
      content: ciResult.value.content,
    });
  } else {
    logger.warn(`CI workflow was not generated: ${ciResult.error.message}`);
  }

  const existingProject = !force && engine.isExistingProject(cwd);

  const writeResult = engine.write(renderResult.value, cwd, {
    overwrite: force,
    ...(language !== undefined && { language }),
    existingProject,
    addOn: isAddOnTemplate(resolveResult.value.metadata),
  });
  if (!writeResult.ok) return Err(new CLIError(writeResult.error.message, ExitCode.ERROR));

  if (writeResult.value.skippedConfigs.length > 0) {
    logger.warn('Skipped existing package config files:');
    for (const file of writeResult.value.skippedConfigs) {
      logger.info(`  - ${file} (add harness dependencies manually)`);
    }
  }

  persistToolingConfig(cwd, resolveResult.value, options.framework);
  if (upgrade) {
    // The existing config was skipped by engine.write (it never overwrites);
    // layer the higher tier's keys under every value the adopter set (#2630).
    const rendered = renderResult.value.files.find((f) => f.relativePath === 'harness.config.json');
    writeUpgradedConfig({
      cwd,
      original: upgrade.original,
      rendered: rendered ? (JSON.parse(rendered.content) as Record<string, unknown>) : {},
      tier: upgrade.to,
    });
  }
  appendFrameworkAgents(cwd, options.framework, language);
  ensureHarnessGitignore(cwd);
  ensureComprehensionSearchIgnore(cwd);

  const eco = applyEcosystemAfterCreate(cwd, writeResult.value.written);
  if (eco.rewritten) {
    logger.info(
      `Scaffolded afterCreate install hook for ${eco.ecosystem!.id}: ${eco.installCommand}`
    );
  } else if (eco.ecosystem === null) {
    logger.warn(
      'No install or verify command could be resolved for this workspace ' +
        '(no recognized lockfile or manifest at the root). The local enforced verify gate ' +
        'has nothing to run and no afterCreate install hook was scaffolded. Configure ' +
        'hooks.afterCreate and the verify command manually for your toolchain.'
    );
  }

  // Sharded-by-default (D5): a brand-new project gets a sharded roadmap — an empty
  // `docs/roadmap.d/_meta.md` and NO monolith aggregate. Per-row shards are the
  // canonical source; the aggregate is generated on demand by `harness roadmap
  // regen`. Existing adopters are left untouched (they opt in via `harness roadmap
  // shard`). `_meta.md` is emitted via the core serializer so it round-trips
  // through the ShardStore parser byte-for-byte (the format is parser-sensitive).
  const roadmapFiles: string[] = [];
  if (!existingProject) {
    roadmapFiles.push(...scaffoldShardedRoadmap(cwd, name));
  }

  // Configure the `ours` merge driver so generated-file merge=ours entries
  // (e.g. the regenerated aggregate) take effect. Non-fatal: warns and continues
  // if git is unavailable or cwd is not a repo.
  const mergeDriver = await configureMergeOursDriver(cwd);
  if (mergeDriver.warning) {
    logger.warn(mergeDriver.warning);
  }

  // Configure the `comprehension` merge driver (ADR 0109 slice 5) so shard
  // conflicts (merge=comprehension) auto-resolve by regenerating from source.
  // Non-fatal: warns and continues if git is unavailable or cwd is not a repo.
  const comprehensionMergeDriver = await configureComprehensionMergeDriver(cwd);
  if (comprehensionMergeDriver.warning) {
    logger.warn(comprehensionMergeDriver.warning);
  }

  return Ok({
    filesCreated: [...writeResult.value.written, ...roadmapFiles],
    skippedConfigs: writeResult.value.skippedConfigs,
    // A tier upgrade merges into the existing harness.config.json (writeUpgradedConfig)
    // rather than leaving it untouched, so it is not reported as a kept file.
    skippedExisting: upgrade
      ? writeResult.value.skippedExisting.filter((f) => f !== 'harness.config.json')
      : writeResult.value.skippedExisting,
    ...(upgrade && { upgradedFrom: upgrade.from }),
  });
}

/**
 * Scaffold an empty sharded roadmap for a fresh project: `docs/roadmap.d/_meta.md`
 * with empty-roadmap frontmatter and no milestones, and crucially NO monolith
 * aggregate (the aggregate is a generated view, produced by `harness roadmap
 * regen`). Returns the created file paths (project-relative) for the success log.
 */
function scaffoldShardedRoadmap(cwd: string, name: string): string[] {
  // Gate on ACTUAL filesystem state, independent of --force: never scaffold an
  // empty sharded roadmap when a roadmap source already exists. Under --force the
  // caller's `!existingProject` gate no longer protects this path, so without this
  // guard a re-init would `mkdir docs/roadmap.d/` + write an empty `_meta.md` over
  // a populated project — orphaning the real roadmap behind empty shards (mode
  // detection would then report sharded and readers would read the empty shards).
  // `roadmapSourceExists` is the single presence authority (it checks both the
  // shard dir and the aggregate), so "one place decides sharded" stays literally
  // true here as well.
  if (roadmapSourceExists(cwd)) return [];
  const shardDir = path.join(cwd, 'docs', 'roadmap.d');
  fs.mkdirSync(shardDir, { recursive: true });
  const nowIso = new Date().toISOString();
  const meta: RoadmapMeta = {
    frontmatter: { project: name, version: 1, lastSynced: nowIso, lastManualEdit: nowIso },
    milestones: [],
  };
  fs.writeFileSync(path.join(shardDir, '_meta.md'), serializeMeta(meta), 'utf-8');
  return [path.join('docs', 'roadmap.d', '_meta.md')];
}

function printInitSuccess(
  filesCreated: string[],
  mcpConfigured: string[],
  skippedExisting: string[] = [],
  upgradedFrom?: string
): void {
  console.log('');
  if (upgradedFrom) {
    logger.success(
      `Project upgraded from tier "${upgradedFrom}" (additive: existing files and config values kept).`
    );
  } else {
    logger.success('Project initialized!');
  }
  console.log('');
  logger.info('Created files:');
  for (const file of filesCreated) {
    console.log(`  ${chalk.green('+')} ${file}`);
  }
  if (skippedExisting.length > 0) {
    console.log('');
    logger.info('Kept existing files (not overwritten; use --force to replace):');
    for (const file of skippedExisting) {
      console.log(`  ${chalk.yellow('=')} ${file}`);
    }
  }
  if (mcpConfigured.length > 0) {
    console.log('');
    logger.info('MCP server configured for:');
    for (const name of mcpConfigured) {
      console.log(`  ${chalk.green('+')} ${name}`);
    }
  }
  console.log('');
  console.log(chalk.bold('Next steps:'));
  console.log(`  1. Review ${chalk.cyan('harness.config.json')}`);
  console.log(`  2. Update ${chalk.cyan('AGENTS.md')} with your project context`);
  console.log(`  3. Run ${chalk.cyan('harness validate')} to check your setup`);
  console.log('');
}

/**
 * The `--tier minimal` fast path (ADR 0101): scaffold exactly the 5 Minimum
 * Viable Harness artifacts and print the ordered upgrade path. STRATEGY.md,
 * framework selection, design system, and MCP integration are deferred (not
 * skipped) — the upgrade path sequences them — so this path deliberately does
 * NOT run setupMcp.
 */
async function runMinimalInitAction(opts: InitOptions & { quiet?: boolean }): Promise<void> {
  const result = await runMinimalInit({
    ...(opts.cwd !== undefined && { cwd: opts.cwd }),
    ...(opts.name !== undefined && { name: opts.name }),
    ...(opts.force !== undefined && { force: opts.force }),
  });

  if (!result.ok) {
    logger.error(result.error.message);
    process.exit(result.error.exitCode);
  }

  if (!opts.quiet) {
    printMinimalInitSuccess(result.value);
  }

  process.exit(ExitCode.SUCCESS);
}

async function runInitAction(opts: InitOptions & { quiet?: boolean }): Promise<void> {
  const result = await runInit(opts);

  if (!result.ok) {
    logger.error(result.error.message);
    process.exit(result.error.exitCode);
  }

  const cwd = opts.cwd ?? process.cwd();
  const mcpResult = setupMcp(cwd, 'all');

  if (!opts.quiet) {
    printInitSuccess(
      result.value.filesCreated,
      mcpResult.configured,
      result.value.skippedExisting,
      result.value.upgradedFrom
    );
  }

  process.exit(ExitCode.SUCCESS);
}

/**
 * Dispatch an `init` invocation. `--tier minimal` is the ADR 0101 fast path;
 * every other tier delegates to the existing adoption-level scaffold (mapped
 * through `level`, with `--template` and `--tier` taking precedence).
 */
async function dispatchInit(
  opts: OptionValues,
  globalOpts: OptionValues,
  levelIsExplicit: boolean
): Promise<void> {
  const tier: string | undefined = opts.tier;
  if (tier !== undefined && !TIER_LEVELS.includes(tier)) {
    logger.error(`Invalid --tier: ${tier}. Must be one of: ${TIER_LEVELS.join(', ')}`);
    process.exit(ExitCode.ERROR);
  }

  const common = {
    name: opts.name,
    framework: opts.framework,
    language: opts.language,
    force: opts.force,
    quiet: globalOpts.quiet,
  };

  if (tier === 'minimal') {
    await runMinimalInitAction(common);
    return;
  }

  // A tier is "requested" only when the adopter named one: `--tier`, or an
  // explicit `--level`. A bare re-run (commander's default level) or a named
  // `--template` never layers over an existing install (#2630).
  const requestedTier =
    opts.template !== undefined ? undefined : (tier ?? (levelIsExplicit ? opts.level : undefined));
  await runInitAction({
    ...common,
    level: opts.template ?? tier ?? opts.level,
    ...(requestedTier !== undefined && { tier: requestedTier }),
  });
}

export function createInitCommand(): Command {
  return new Command('init')
    .description('Initialize a new harness-engineering project')
    .option('-n, --name <name>', 'Project name')
    .option(
      '-l, --level <level>',
      'Adoption level (basic, intermediate, load-bearing-minimum, advanced)',
      'load-bearing-minimum'
    )
    .option('-t, --template <template>', 'Specific template name (e.g. orchestrator)')
    .option(
      '--tier <tier>',
      'Adoption tier (ADR 0101): minimal (the 5-item Minimum Viable Harness floor), basic, intermediate, load-bearing-minimum, advanced'
    )
    .option('--framework <framework>', 'Framework overlay (nextjs)')
    .option('--language <language>', 'Target language (typescript, python, go, rust, java)')
    .option('-f, --force', 'Overwrite existing files')
    .option('-y, --yes', 'Use defaults without prompting')
    .action(async (opts, cmd) => {
      await dispatchInit(
        opts,
        cmd.optsWithGlobals(),
        cmd.getOptionValueSource('level') !== 'default'
      );
    });
}
