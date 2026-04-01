/**
 * Shared scan-config types and utilities.
 * Used by both the CLI `harness scan-config` command and the orchestrator workspace scanner.
 */

import type { InjectionFinding } from './injection-patterns';
import type { SecurityFinding } from './types';

export interface ScanConfigFinding {
  ruleId: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  match: string;
  line?: number;
}

export interface ScanConfigFileResult {
  file: string;
  findings: ScanConfigFinding[];
  overallSeverity: 'high' | 'medium' | 'low' | 'clean';
}

export interface ScanConfigResult {
  exitCode: number;
  results: ScanConfigFileResult[];
}

export function mapSecuritySeverity(severity: string): 'high' | 'medium' | 'low' {
  if (severity === 'error') return 'high';
  if (severity === 'warning') return 'medium';
  return 'low';
}

export function computeOverallSeverity(
  findings: ScanConfigFinding[]
): 'high' | 'medium' | 'low' | 'clean' {
  if (findings.length === 0) return 'clean';
  if (findings.some((f) => f.severity === 'high')) return 'high';
  if (findings.some((f) => f.severity === 'medium')) return 'medium';
  return 'low';
}

export function computeScanExitCode(results: ScanConfigFileResult[]): number {
  for (const r of results) {
    if (r.overallSeverity === 'high') return 2;
  }
  for (const r of results) {
    if (r.overallSeverity === 'medium') return 1;
  }
  return 0;
}

export function mapInjectionFindings(injectionFindings: InjectionFinding[]): ScanConfigFinding[] {
  return injectionFindings.map((f) => ({
    ruleId: f.ruleId,
    severity: f.severity as 'high' | 'medium' | 'low',
    message: `Injection pattern detected: ${f.ruleId}`,
    match: f.match,
    ...(f.line !== undefined ? { line: f.line } : {}),
  }));
}

export function isDuplicateFinding(
  existing: ScanConfigFinding[],
  secFinding: SecurityFinding
): boolean {
  return existing.some(
    (e) =>
      e.line === secFinding.line &&
      e.match === secFinding.match.trim() &&
      e.ruleId.split('-')[0] === secFinding.ruleId.split('-')[0]
  );
}

export function mapSecurityFindings(
  secFindings: SecurityFinding[],
  existing: ScanConfigFinding[]
): ScanConfigFinding[] {
  const result: ScanConfigFinding[] = [];
  for (const f of secFindings) {
    if (!isDuplicateFinding(existing, f)) {
      result.push({
        ruleId: f.ruleId,
        severity: mapSecuritySeverity(f.severity),
        message: f.message,
        match: f.match,
        ...(f.line !== undefined ? { line: f.line } : {}),
      });
    }
  }
  return result;
}
