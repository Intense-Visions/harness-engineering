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
import type {
  ScanConfigFileResult,
  ScanConfigResult,
  ScanConfigFinding,
} from '@harness-engineering/core';

/** Files to scan for injection patterns and SEC-AGT rule violations. */
const CONFIG_FILES = ['CLAUDE.md', 'AGENTS.md', '.gemini/settings.json', 'skill.yaml'];

/**
 * Injection categories that reliably indicate malicious content and should
 * block dispatch (remain severity 'high'). Other categories (encoded-payloads,
 * context-manipulation, etc.) have high false-positive rates on documentation
 * files and are downgraded to 'medium' (taint-only) for dispatch decisions.
 */
const BLOCKING_INJECTION_PREFIXES = ['INJ-UNI-', 'INJ-REROL-'];

/**
 * Security rules that should be downgraded to 'medium' in the config scanner.
 * SEC-AGT-006 matches `--no-verify` and `--dangerously-skip-permissions` which
 * appear in AGENTS.md documentation about hooks that *block* these flags —
 * flagging documentation of a security measure as a security violation.
 */
const DOWNGRADED_SECURITY_RULES = new Set(['SEC-AGT-006']);

/**
 * Downgrade findings that are noisy on documentation files from 'high' to
 * 'medium' so they taint the session instead of blocking dispatch.
 */
function adjustFindingSeverity(findings: ScanConfigFinding[]): ScanConfigFinding[] {
  return findings.map((f) => {
    if (f.severity !== 'high') return f;
    // Keep blocking injection categories at high severity
    if (BLOCKING_INJECTION_PREFIXES.some((prefix) => f.ruleId.startsWith(prefix))) return f;
    // Downgrade noisy injection and security patterns
    if (f.ruleId.startsWith('INJ-') || DOWNGRADED_SECURITY_RULES.has(f.ruleId)) {
      return { ...f, severity: 'medium' as const };
    }
    return f;
  });
}

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

  // Downgrade noisy patterns after all findings are collected so the
  // severity adjustment applies uniformly to both injection and security findings.
  const adjusted = adjustFindingSeverity(findings);

  return {
    file: relative(targetDir, filePath).replaceAll('\\', '/'),
    findings: adjusted,
    overallSeverity: computeOverallSeverity(adjusted),
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
