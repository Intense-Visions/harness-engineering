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

function checkStaleness(
  planName: string,
  plannedFiles: string[],
  planModTime: Date,
  projectPath: string,
  result: CrossCheckResult
): void {
  for (const file of plannedFiles) {
    const fullPath = path.join(projectPath, file);
    if (!fs.existsSync(fullPath)) continue;
    const implModTime = getFileModTime(fullPath, projectPath);
    if (implModTime && implModTime > planModTime) {
      result.staleness.push(`${planName}: implementation newer than plan (${file})`);
      result.warnings++;
      break;
    }
  }
}

function checkPlanCoverage(
  planFile: string,
  options: CrossCheckOptions,
  result: CrossCheckResult
): void {
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

  const planModTime = getFileModTime(planFile, options.projectPath);
  if (planModTime) {
    checkStaleness(planName, plannedFiles, planModTime, options.projectPath, result);
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
  for (const planFile of planFiles) {
    checkPlanCoverage(planFile, options, result);
  }

  return Ok(result);
}
