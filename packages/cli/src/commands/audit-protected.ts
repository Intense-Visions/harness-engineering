// packages/cli/src/commands/audit-protected.ts
import { Command } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import type { Result, ProtectedRegion, AnnotationIssue } from '@harness-engineering/core';
import { Ok, Err, parseFileRegions } from '@harness-engineering/core';
import { resolveConfig } from '../config/loader';
import { OutputFormatter, OutputMode } from '../output/formatter';
import { resolveOutputMode } from '../utils/output';
import { logger } from '../output/logger';
import { CLIError, ExitCode } from '../utils/errors';
import { glob } from 'glob';

interface AuditProtectedResult {
  regions: ProtectedRegion[];
  issues: AnnotationIssue[];
  fileCount: number;
}

export async function runAuditProtected(options: {
  cwd?: string;
  configPath?: string;
}): Promise<Result<AuditProtectedResult, CLIError>> {
  const cwd = options.cwd ?? process.cwd();

  const configResult = resolveConfig(options.configPath);
  if (!configResult.ok) {
    return Err(configResult.error);
  }
  const config = configResult.value;

  const rootDir = path.resolve(cwd, config.rootDir);
  const excludePatterns = config.entropy?.excludePatterns ?? ['**/node_modules/**', '**/*.test.ts'];

  let files: string[];
  try {
    files = await glob('**/*.{ts,tsx,js,jsx,py,sh}', {
      cwd: rootDir,
      ignore: excludePatterns,
    });
  } catch (e) {
    return Err(new CLIError(`Failed to scan files: ${(e as Error).message}`, ExitCode.ERROR));
  }

  const allRegions: ProtectedRegion[] = [];
  const allIssues: AnnotationIssue[] = [];

  for (const relativePath of files) {
    const absolutePath = path.resolve(rootDir, relativePath);
    let content: string;
    try {
      content = fs.readFileSync(absolutePath, 'utf-8');
    } catch {
      continue;
    }

    const { regions, issues } = parseFileRegions(relativePath, content);
    allRegions.push(...regions);
    allIssues.push(...issues);
  }

  return Ok({
    regions: allRegions,
    issues: allIssues,
    fileCount: files.length,
  });
}

function formatRegion(region: ProtectedRegion): string {
  const lineRange =
    region.startLine === region.endLine
      ? `${region.startLine}`
      : `${region.startLine}-${region.endLine}`;
  const scopes = region.scopes.join(',');
  const reason = region.reason ? ` ${region.reason}` : '';
  return `  ${region.file}:${lineRange} [${scopes}]${reason}`;
}

function printAuditResult(result: AuditProtectedResult, formatter: OutputFormatter): void {
  const regionCount = result.regions.length;
  const fileSet = new Set(result.regions.map((r) => r.file));

  console.log(
    formatter.formatSummary('Protected regions', `${regionCount} in ${fileSet.size} file(s)`, true)
  );

  if (regionCount > 0) {
    console.log(`\nFound ${regionCount} protected region(s) in ${fileSet.size} file(s):\n`);
    for (const region of result.regions) {
      console.log(formatRegion(region));
    }
  }

  if (result.issues.length > 0) {
    console.log(`\nIssues (${result.issues.length}):`);
    for (const issue of result.issues) {
      console.log(`  ${issue.file}:${issue.line} — ${issue.message}`);
    }
  }
}

export function createAuditProtectedCommand(): Command {
  const command = new Command('audit-protected')
    .description('Report all harness-ignore protected code regions')
    .action(async (_opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode = resolveOutputMode(globalOpts);
      const formatter = new OutputFormatter(mode);

      const result = await runAuditProtected({
        configPath: globalOpts.config,
      });

      if (!result.ok) {
        if (mode === OutputMode.JSON) {
          console.log(JSON.stringify({ error: result.error.message }));
        } else {
          logger.error(result.error.message);
        }
        process.exit(result.error.exitCode);
      }

      if (mode === OutputMode.JSON) {
        console.log(JSON.stringify(result.value, null, 2));
      } else if (mode !== OutputMode.QUIET || result.value.regions.length > 0) {
        printAuditResult(result.value, formatter);
      }

      process.exit(result.value.issues.length > 0 ? ExitCode.VALIDATION_FAILED : ExitCode.SUCCESS);
    });

  return command;
}
