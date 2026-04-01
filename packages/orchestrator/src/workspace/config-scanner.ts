import { existsSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { scanForInjection, SecurityScanner, parseSecurityConfig } from '@harness-engineering/core';
import type { InjectionFinding, SecurityFinding } from '@harness-engineering/core';

/** Files to scan for injection patterns and SEC-AGT rule violations. */
const CONFIG_FILES = ['CLAUDE.md', 'AGENTS.md', '.gemini/settings.json', 'skill.yaml'];

export interface ConfigScanFinding {
  ruleId: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  match: string;
  line?: number;
}

export interface ConfigScanFileResult {
  file: string;
  findings: ConfigScanFinding[];
  overallSeverity: 'high' | 'medium' | 'low' | 'clean';
}

export interface ConfigScanResult {
  exitCode: number;
  results: ConfigScanFileResult[];
}

function mapSecuritySeverity(severity: string): 'high' | 'medium' | 'low' {
  if (severity === 'error') return 'high';
  if (severity === 'warning') return 'medium';
  return 'low';
}

function computeOverallSeverity(
  findings: ConfigScanFinding[]
): 'high' | 'medium' | 'low' | 'clean' {
  if (findings.length === 0) return 'clean';
  if (findings.some((f) => f.severity === 'high')) return 'high';
  if (findings.some((f) => f.severity === 'medium')) return 'medium';
  return 'low';
}

function computeExitCode(results: ConfigScanFileResult[]): number {
  for (const r of results) {
    if (r.overallSeverity === 'high') return 2;
  }
  for (const r of results) {
    if (r.overallSeverity === 'medium') return 1;
  }
  return 0;
}

function mapInjectionFindings(injectionFindings: InjectionFinding[]): ConfigScanFinding[] {
  return injectionFindings.map((f) => ({
    ruleId: f.ruleId,
    severity: f.severity,
    message: `Injection pattern detected: ${f.ruleId}`,
    match: f.match,
    line: f.line,
  }));
}

function isDuplicateFinding(existing: ConfigScanFinding[], secFinding: SecurityFinding): boolean {
  return existing.some(
    (e) =>
      e.line === secFinding.line &&
      e.match === secFinding.match.trim() &&
      e.ruleId.split('-')[0] === secFinding.ruleId.split('-')[0]
  );
}

function mapSecurityFindings(
  secFindings: SecurityFinding[],
  existing: ConfigScanFinding[]
): ConfigScanFinding[] {
  const result: ConfigScanFinding[] = [];
  for (const f of secFindings) {
    if (!isDuplicateFinding(existing, f)) {
      result.push({
        ruleId: f.ruleId,
        severity: mapSecuritySeverity(f.severity),
        message: f.message,
        match: f.match,
        line: f.line,
      });
    }
  }
  return result;
}

function scanSingleFile(
  filePath: string,
  targetDir: string,
  scanner: SecurityScanner
): ConfigScanFileResult | null {
  if (!existsSync(filePath)) return null;

  let content: string;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }

  const injectionFindings = scanForInjection(content);
  const findings = mapInjectionFindings(injectionFindings);

  const secFindings = scanner.scanContent(content, filePath);
  findings.push(...mapSecurityFindings(secFindings, findings));

  return {
    file: relative(targetDir, filePath),
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
export async function scanWorkspaceConfig(workspacePath: string): Promise<ConfigScanResult> {
  const scanner = new SecurityScanner(parseSecurityConfig({}));
  const results: ConfigScanFileResult[] = [];

  for (const configFile of CONFIG_FILES) {
    const result = scanSingleFile(join(workspacePath, configFile), workspacePath, scanner);
    if (result) results.push(result);
  }

  return { exitCode: computeExitCode(results), results };
}
