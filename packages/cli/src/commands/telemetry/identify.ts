import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { readIdentity } from '@harness-engineering/core';
import { logger } from '../../output/logger';

interface TelemetryFile {
  identity: {
    project?: string;
    team?: string;
    alias?: string;
  };
}

function telemetryFilePath(cwd: string): string {
  return path.join(cwd, '.harness', 'telemetry.json');
}

function writeTelemetryFile(cwd: string, data: TelemetryFile): void {
  const filePath = telemetryFilePath(cwd);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

const IDENTITY_FIELDS = ['project', 'team', 'alias'] as const;

function applyIdentityFields(
  opts: Record<string, string | undefined>,
  identity: TelemetryFile['identity']
): void {
  for (const field of IDENTITY_FIELDS) {
    if (opts[field]) identity[field] = opts[field];
  }
}

function printIdentity(identity: TelemetryFile['identity']): void {
  for (const field of IDENTITY_FIELDS) {
    if (identity[field]) logger.info(`  ${field.padEnd(7)}: ${identity[field]}`);
  }
}

export function createIdentifyCommand(): Command {
  const cmd = new Command('identify')
    .description('Set or clear telemetry identity fields in .harness/telemetry.json')
    .option('--project <name>', 'Project name')
    .option('--team <name>', 'Team name')
    .option('--alias <name>', 'User alias')
    .option('--clear', 'Remove all identity fields')
    .action((opts) => {
      const cwd = process.cwd();

      if (opts.clear) {
        writeTelemetryFile(cwd, { identity: {} });
        logger.success('Telemetry identity cleared.');
        return;
      }

      const hasField = IDENTITY_FIELDS.some((f) => opts[f]);
      if (!hasField) {
        logger.error('Provide at least one of --project, --team, --alias, or --clear.');
        process.exitCode = 1;
        return;
      }

      const existingIdentity = readIdentity(cwd);
      const existing: TelemetryFile = { identity: { ...existingIdentity } };
      applyIdentityFields(opts, existing.identity);

      writeTelemetryFile(cwd, existing);
      logger.success('Telemetry identity updated:');
      printIdentity(existing.identity);
    });

  return cmd;
}
