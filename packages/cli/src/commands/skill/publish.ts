import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { logger } from '../../output/logger';
import { ExitCode } from '../../utils/errors';
import { validateForPublish } from '../../registry/validator';
import { derivePackageJson } from '../../skill/package-json';

export interface PublishResult {
  name: string;
  version: string;
  published: boolean;
  dryRun?: boolean;
}

interface PublishOptions {
  dryRun?: boolean;
}

/**
 * Run the publish pipeline: validate, generate package.json, and npm publish.
 */
export async function runPublish(skillDir: string, opts: PublishOptions): Promise<PublishResult> {
  // 1. Run validation
  const validation = await validateForPublish(skillDir);
  if (!validation.valid) {
    const errorList = validation.errors.map((e) => `  - ${e}`).join('\n');
    throw new Error(`Pre-publish validation failed:\n${errorList}`);
  }

  const meta = validation.skillMeta!;

  // 2. Generate package.json
  const pkg = derivePackageJson(meta);
  const pkgPath = path.join(skillDir, 'package.json');
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  // 3. Generate README.md if not present
  const readmePath = path.join(skillDir, 'README.md');
  if (!fs.existsSync(readmePath)) {
    const skillMdContent = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf-8');
    const readme = `# ${pkg.name}\n\n${meta.description}\n\n## Installation\n\n\`\`\`bash\nharness install ${meta.name}\n\`\`\`\n\n---\n\n${skillMdContent}`;
    fs.writeFileSync(readmePath, readme);
  }

  // 4. Dry run check
  if (opts.dryRun) {
    return {
      name: pkg.name,
      version: pkg.version,
      published: false,
      dryRun: true,
    };
  }

  // 5. npm publish
  execFileSync('npm', ['publish', '--access', 'public'], {
    cwd: skillDir,
    stdio: 'pipe',
    timeout: 60_000,
  });

  return {
    name: pkg.name,
    version: pkg.version,
    published: true,
  };
}

export function createPublishCommand(): Command {
  return new Command('publish')
    .description('Validate and publish a skill to @harness-skills on npm')
    .option('--dry-run', 'Run validation and generate package.json without publishing')
    .option('--dir <dir>', 'Skill directory (default: current directory)')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const skillDir = opts.dir || process.cwd();

      try {
        const result = await runPublish(skillDir, {
          dryRun: opts.dryRun,
        });

        if (globalOpts.json) {
          logger.raw(result);
        } else if (result.dryRun) {
          logger.success(`Validation passed. Would publish: ${result.name}@${result.version}`);
          logger.info('Run without --dry-run to publish.');
        } else {
          logger.success(`Published ${result.name}@${result.version}`);
        }
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exit(ExitCode.VALIDATION_FAILED);
      }
    });
}
