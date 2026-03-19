import type { Result } from '../../shared/result';
import { Ok } from '../../shared/result';
import type {
  EntropyError,
  SizeBudgetConfig,
  SizeBudgetReport,
  SizeBudgetViolation,
} from '../types';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Parse a human-readable size string into bytes.
 * Supports: "100KB", "1MB", "500", "1GB".
 */
export function parseSize(size: string): number {
  const match = size.trim().match(/^(\d+(?:\.\d+)?)\s*(KB|MB|GB|B)?$/i);
  if (!match) return 0;
  const value = parseFloat(match[1]!);
  const unit = (match[2] || 'B').toUpperCase();
  switch (unit) {
    case 'KB':
      return Math.round(value * 1024);
    case 'MB':
      return Math.round(value * 1024 * 1024);
    case 'GB':
      return Math.round(value * 1024 * 1024 * 1024);
    default:
      return Math.round(value);
  }
}

/**
 * Recursively compute directory size in bytes.
 * Skips node_modules and .git.
 */
function dirSize(dirPath: string): number {
  let total = 0;
  let entries: string[];
  try {
    entries = readdirSync(dirPath);
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const fullPath = join(dirPath, entry);
    try {
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        total += dirSize(fullPath);
      } else if (stat.isFile()) {
        total += stat.size;
      }
    } catch {
      continue;
    }
  }
  return total;
}

/**
 * Detect size budget violations for configured packages.
 */
export async function detectSizeBudgetViolations(
  rootDir: string,
  config?: Partial<SizeBudgetConfig>
): Promise<Result<SizeBudgetReport, EntropyError>> {
  const budgets = config?.budgets ?? {};
  const violations: SizeBudgetViolation[] = [];
  let packagesChecked = 0;

  for (const [pkgPath, budget] of Object.entries(budgets)) {
    packagesChecked++;
    const distPath = join(rootDir, pkgPath, 'dist');
    const currentSize = dirSize(distPath);

    if (budget.warn) {
      const budgetBytes = parseSize(budget.warn);
      if (budgetBytes > 0 && currentSize > budgetBytes) {
        violations.push({
          package: pkgPath,
          currentSize,
          budgetSize: budgetBytes,
          unit: 'bytes',
          tier: 2,
          severity: 'warning',
        });
      }
    }
  }

  const warningCount = violations.filter((v) => v.severity === 'warning').length;
  const infoCount = violations.filter((v) => v.severity === 'info').length;

  return Ok({
    violations,
    stats: {
      packagesChecked,
      violationCount: violations.length,
      warningCount,
      infoCount,
    },
  });
}
