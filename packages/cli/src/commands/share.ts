import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { parseManifest, extractBundle, writeConfig } from '@harness-engineering/core';
import { resolveConfig } from '../config/loader';
import { logger } from '../output/logger';

const MANIFEST_FILENAME = 'constraints.yaml';

async function runShareAction(projectPath: string, options: { output: string }): Promise<void> {
  const rootDir = path.resolve(projectPath);
  const manifestPath = path.join(rootDir, MANIFEST_FILENAME);

  if (!fs.existsSync(manifestPath)) {
    logger.error(
      `No ${MANIFEST_FILENAME} found at ${manifestPath}.\n` +
        `Create a constraints.yaml in your project root to define what to share.`
    );
    process.exit(1);
  }

  let parsed: unknown;
  try {
    const raw = fs.readFileSync(manifestPath, 'utf-8');
    parsed = parseYaml(raw);
  } catch (err) {
    logger.error(
      `Failed to read ${MANIFEST_FILENAME}: ${err instanceof Error ? err.message : String(err)}`
    );
    process.exit(1);
  }

  const manifestResult = parseManifest(parsed);
  if (!manifestResult.ok) {
    logger.error(`Invalid ${MANIFEST_FILENAME}: ${manifestResult.error}`);
    process.exit(1);
  }
  const manifest = manifestResult.value;

  const configResult = resolveConfig(path.join(rootDir, 'harness.config.json'));
  if (!configResult.ok) {
    logger.error(configResult.error.message);
    process.exit(1);
  }
  const config = configResult.value as Record<string, unknown>;

  const bundleResult = extractBundle(manifest, config);
  if (!bundleResult.ok) {
    logger.error(`Failed to extract bundle: ${bundleResult.error}`);
    process.exit(1);
  }
  const bundle = bundleResult.value;

  if (Object.keys(bundle.constraints).length === 0) {
    logger.error(
      'No constraints found for the include paths in constraints.yaml.\n' +
        'Check that your harness config contains the declared sections.'
    );
    process.exit(1);
  }

  const outputDir = path.resolve(options.output);
  const outputPath = path.join(outputDir, `${manifest.name}.harness-constraints.json`);

  const writeResult = await writeConfig(outputPath, bundle);
  if (!writeResult.ok) {
    logger.error(`Failed to write bundle: ${writeResult.error.message}`);
    process.exit(1);
  }

  logger.success(`Bundle written to ${outputPath}`);
}

export function createShareCommand(): Command {
  return new Command('share')
    .description('Extract and publish a constraints bundle from constraints.yaml')
    .argument('[path]', 'Path to the project root', '.')
    .option('-o, --output <dir>', 'Output directory for the bundle', '.')
    .action(async (projectPath: string, options: { output: string }) => {
      await runShareAction(projectPath, options);
    });
}
