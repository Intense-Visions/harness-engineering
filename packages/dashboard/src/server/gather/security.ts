import {
  SECURITY_SCAN_DEFAULT_IGNORE,
  SECURITY_SCAN_GLOB,
  SecurityScanner,
} from '@harness-engineering/core';
import { glob } from 'glob';
import type { SecurityResult } from '../../shared/types';

// Shared with `harness check-security` and the CI orchestrator — see
// packages/core/src/security/scan-targets.ts. Local copies of this glob had already
// drifted apart and all three omitted .mjs/.cjs.
const SCAN_PATTERN = SECURITY_SCAN_GLOB;
const SCAN_IGNORE = [...SECURITY_SCAN_DEFAULT_IGNORE];

/**
 * Run a security scan on the project and return a summary.
 * Returns an error object instead of throwing on failure.
 */
export async function gatherSecurity(projectPath: string): Promise<SecurityResult> {
  try {
    const scanner = new SecurityScanner();
    scanner.configureForProject(projectPath);

    const filesToScan = await glob(SCAN_PATTERN, {
      cwd: projectPath,
      absolute: true,
      ignore: SCAN_IGNORE,
    });

    const result = await scanner.scanFiles(filesToScan);

    const errorCount = result.findings.filter((f) => f.severity === 'error').length;
    const warningCount = result.findings.filter((f) => f.severity === 'warning').length;
    const infoCount = result.findings.filter((f) => f.severity === 'info').length;
    const hasErrors = errorCount > 0;

    return {
      valid: !hasErrors,
      findings: result.findings.map((f) => ({
        ruleId: f.ruleId,
        category: f.category,
        severity: f.severity,
        file: f.file,
        line: f.line,
        message: f.message,
      })),
      stats: {
        filesScanned: result.scannedFiles,
        errorCount,
        warningCount,
        infoCount,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message };
  }
}
