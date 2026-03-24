import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';
import { parseManifest, extractBundle, writeConfig } from '@harness-engineering/core';
import { resolveConfig } from '../config/loader';
import { logger } from '../output/logger';

const MANIFEST_FILENAME = 'constraints.yaml';

export function createShareCommand(): Command {
  return new Command('share')
    .description('Extract and publish a constraints bundle from constraints.yaml')
    .argument('[path]', 'Path to the project root', '.')
    .option('-o, --output <dir>', 'Output directory for the bundle', '.')
    .action(async (projectPath: string, options: { output: string }) => {
      const rootDir = path.resolve(projectPath);
      const manifestPath = path.join(rootDir, MANIFEST_FILENAME);

      // Check constraints.yaml exists
      if (!fs.existsSync(manifestPath)) {
        logger.error(
          `No ${MANIFEST_FILENAME} found at ${manifestPath}.\n` +
            `Run "harness share --init" to create one.`
        );
        process.exit(1);
      }

      // Read and parse YAML
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

      // Validate manifest
      const manifestResult = parseManifest(parsed);
      if (!manifestResult.ok) {
        logger.error(`Invalid ${MANIFEST_FILENAME}: ${manifestResult.error}`);
        process.exit(1);
      }
      const manifest = manifestResult.value;

      // Load harness config
      const configResult = resolveConfig();
      if (!configResult.ok) {
        logger.error(configResult.error.message);
        process.exit(1);
      }
      const config = configResult.value as Record<string, unknown>;

      // Extract bundle
      const bundleResult = extractBundle(manifest, config);
      if (!bundleResult.ok) {
        logger.error(`Failed to extract bundle: ${bundleResult.error}`);
        process.exit(1);
      }
      const bundle = bundleResult.value;

      // Write bundle
      const outputDir = path.resolve(options.output);
      const outputPath = path.join(outputDir, `${manifest.name}.harness-constraints.json`);

      try {
        await writeConfig(outputPath, bundle);
      } catch (err) {
        logger.error(`Failed to write bundle: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      }

      logger.success(`Bundle written to ${outputPath}`);
    });
}
