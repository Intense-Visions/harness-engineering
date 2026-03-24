import { Command } from 'commander';
import * as path from 'path';
import { ProjectScanner, BlueprintGenerator } from '@harness-engineering/core';
import { logger } from '../output/logger';

export function createBlueprintCommand(): Command {
  return new Command('blueprint')
    .description('Generate a self-contained, interactive blueprint of the codebase')
    .argument('[path]', 'Path to the project root', '.')
    .option('-o, --output <dir>', 'Output directory', 'docs/blueprint')
    .action(async (projectPath, options) => {
      try {
        const rootDir = path.resolve(projectPath);
        const outputDir = path.resolve(options.output);

        logger.info(`Scanning project at ${rootDir}...`);
        const scanner = new ProjectScanner(rootDir);
        const data = await scanner.scan();

        logger.info(`Generating blueprint to ${outputDir}...`);
        const generator = new BlueprintGenerator();
        await generator.generate(data, { outputDir });

        logger.success(`Blueprint generated successfully at ${path.join(outputDir, 'index.html')}`);
      } catch (error) {
        logger.error(
          `Failed to generate blueprint: ${error instanceof Error ? error.message : String(error)}`
        );
        process.exit(1);
      }
    });
}
