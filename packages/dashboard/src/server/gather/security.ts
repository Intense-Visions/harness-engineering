import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  SECURITY_SCAN_DEFAULT_IGNORE,
  SECURITY_SCAN_GLOB,
  SecurityScanner,
  parseSecurityConfig,
} from '@harness-engineering/core';
import { glob } from 'glob';
import type { SecurityResult } from '../../shared/types';

// Shared with `harness check-security` and the CI orchestrator — see
// packages/core/src/security/scan-targets.ts. Local copies of this glob had already
// drifted apart and all three omitted .mjs/.cjs.
const SCAN_PATTERN = SECURITY_SCAN_GLOB;

/**
 * The project's `security.exclude`, resolved the way `harness check-security`
 * resolves it, so the dashboard reads the same files as the CLI gate (#2391).
 * A missing or unreadable config falls back to the shared default ignores.
 */
function resolveScanIgnore(projectPath: string): string[] {
  try {
    const raw = JSON.parse(readFileSync(join(projectPath, 'harness.config.json'), 'utf-8'));
    return parseSecurityConfig(raw?.security ?? {}).exclude ?? [...SECURITY_SCAN_DEFAULT_IGNORE];
  } catch {
    return [...SECURITY_SCAN_DEFAULT_IGNORE];
  }
}

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
      ignore: resolveScanIgnore(projectPath),
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
