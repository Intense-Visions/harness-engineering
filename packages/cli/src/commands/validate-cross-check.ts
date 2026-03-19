import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import type { Result } from '@harness-engineering/core';
import { Ok } from '@harness-engineering/core';
import { CLIError } from '../utils/errors';

interface CrossCheckResult {
  specToPlan: string[];
  planToImpl: string[];
  staleness: string[];
  warnings: number;
}

interface CrossCheckOptions {
  specsDir: string;
  plansDir: string;
  projectPath: string;
}

function findFiles(dir: string, ext: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(ext))
    .map((f) => path.join(dir, f));
}

function extractPlannedFiles(planContent: string): string[] {
  const files: string[] = [];
  const regex = /- (?:Create|Modify):\s*`([^`]+)`/g;
  let match;
  while ((match = regex.exec(planContent)) !== null) {
    if (match[1]) files.push(match[1]);
  }
  return files;
}

function getFileModTime(filePath: string, projectPath: string): Date | null {
  try {
    const output = execFileSync('git', ['log', '-1', '--format=%aI', '--', filePath], {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return output ? new Date(output) : null;
  } catch {
    return null;
  }
}

export async function runCrossCheck(
  options: CrossCheckOptions
): Promise<Result<CrossCheckResult, CLIError>> {
  const result: CrossCheckResult = {
    specToPlan: [],
    planToImpl: [],
    staleness: [],
    warnings: 0,
  };

  const planFiles = findFiles(options.plansDir, '.md');

  // Check: Plan → Implementation coverage
  for (const planFile of planFiles) {
    const content = fs.readFileSync(planFile, 'utf-8');
    const plannedFiles = extractPlannedFiles(content);
    const planName = path.basename(planFile);

    for (const file of plannedFiles) {
      const fullPath = path.join(options.projectPath, file);
      if (!fs.existsSync(fullPath)) {
        result.planToImpl.push(`${planName}: planned file not found: ${file}`);
        result.warnings++;
      }
    }

    // Check staleness
    const planModTime = getFileModTime(planFile, options.projectPath);
    if (planModTime) {
      for (const file of plannedFiles) {
        const fullPath = path.join(options.projectPath, file);
        if (fs.existsSync(fullPath)) {
          const implModTime = getFileModTime(fullPath, options.projectPath);
          if (implModTime && implModTime > planModTime) {
            result.staleness.push(`${planName}: implementation newer than plan (${file})`);
            result.warnings++;
            break; // One staleness warning per plan is enough
          }
        }
      }
    }
  }

  return Ok(result);
}
