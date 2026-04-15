import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import {
  scanForInjection,
  SecurityScanner,
  parseSecurityConfig,
  mapInjectionFindings,
  mapSecurityFindings,
  computeOverallSeverity,
  computeScanExitCode,
} from '@harness-engineering/core';
import type { ScanConfigFileResult, ScanConfigResult } from '@harness-engineering/core';

/** Files to scan for injection patterns and SEC-AGT rule violations. */
const CONFIG_FILES = ['CLAUDE.md', 'AGENTS.md', '.gemini/settings.json', 'skill.yaml'];

async function scanSingleFile(
  filePath: string,
  targetDir: string,
  scanner: SecurityScanner
): Promise<ScanConfigFileResult | null> {
  if (!existsSync(filePath)) return null;

  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }

  const injectionFindings = scanForInjection(content);
  const findings = mapInjectionFindings(injectionFindings);

  // Use scanFile (not scanContent) so fileGlob filtering is applied.
  // Without this, rules like SEC-AGT-007 (hooks.json only) and SEC-MCP-002
  // (.mcp.json only) would fire on CLAUDE.md/AGENTS.md, causing false positives.
  const secFindings = await scanner.scanFile(filePath);
  findings.push(...mapSecurityFindings(secFindings, findings));

  return {
    file: relative(targetDir, filePath).replaceAll('\\', '/'),
    findings,
    overallSeverity: computeOverallSeverity(findings),
  };
}

/**
 * Scan workspace config files for injection patterns and security violations.
 * Mirrors the logic of `harness scan-config` without CLI dependencies.
 *
 * Exit codes:
 *   0 = clean (no findings or low-severity only)
 *   1 = medium-severity findings
 *   2 = high-severity findings
 */
export async function scanWorkspaceConfig(workspacePath: string): Promise<ScanConfigResult> {
  const scanner = new SecurityScanner(parseSecurityConfig({}));
  const results: ScanConfigFileResult[] = [];

  for (const configFile of CONFIG_FILES) {
    const result = await scanSingleFile(join(workspacePath, configFile), workspacePath, scanner);
    if (result) results.push(result);
  }

  return { exitCode: computeScanExitCode(results), results };
}

export type { ScanConfigFileResult, ScanConfigResult };
