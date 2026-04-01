import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { scanForInjection, SecurityScanner, parseSecurityConfig } from '@harness-engineering/core';
import type { InjectionFinding, SecurityFinding } from '@harness-engineering/core';
import { OutputMode, type OutputModeType } from '../output/formatter';
import { logger } from '../output/logger';

/** Files to scan for injection patterns and SEC-AGT rule violations. */
const CONFIG_FILES = ['CLAUDE.md', 'AGENTS.md', '.gemini/settings.json', 'skill.yaml'];

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

interface ScanConfigOptions {
  fix?: boolean;
}

/**
 * Map SecurityScanner severity to scan-config severity.
 * SEC-AGT 'error' -> 'high', 'warning' -> 'medium', 'info' -> 'low'
 */
function mapSecuritySeverity(severity: string): 'high' | 'medium' | 'low' {
  if (severity === 'error') return 'high';
  if (severity === 'warning') return 'medium';
  return 'low';
}

function computeOverallSeverity(
  findings: ScanConfigFinding[]
): 'high' | 'medium' | 'low' | 'clean' {
  if (findings.length === 0) return 'clean';
  if (findings.some((f) => f.severity === 'high')) return 'high';
  if (findings.some((f) => f.severity === 'medium')) return 'medium';
  return 'low';
}

function computeExitCode(results: ScanConfigFileResult[]): number {
  let maxSeverity: 'clean' | 'low' | 'medium' | 'high' = 'clean';
  for (const r of results) {
    if (r.overallSeverity === 'high') return 2;
    if (r.overallSeverity === 'medium') maxSeverity = 'medium';
    if (r.overallSeverity === 'low' && maxSeverity === 'clean') maxSeverity = 'low';
  }
  return maxSeverity === 'medium' ? 1 : 0;
}

/**
 * Strip high-severity injection patterns from file content.
 * Returns the cleaned content and the number of lines modified.
 */
function stripHighSeverityPatterns(
  content: string,
  injectionFindings: InjectionFinding[]
): { cleaned: string; linesStripped: number } {
  const highLines = new Set<number>();
  for (const f of injectionFindings) {
    if (f.severity === 'high' && f.line !== undefined) {
      highLines.add(f.line);
    }
  }

  if (highLines.size === 0) return { cleaned: content, linesStripped: 0 };

  const lines = content.split('\n');
  let linesStripped = 0;

  for (const lineNum of highLines) {
    const idx = lineNum - 1;
    if (idx >= 0 && idx < lines.length) {
      lines[idx] = '';
      linesStripped++;
    }
  }

  return { cleaned: lines.join('\n'), linesStripped };
}

/** Convert injection engine findings to ScanConfigFinding format. */
function mapInjectionFindings(injectionFindings: InjectionFinding[]): ScanConfigFinding[] {
  return injectionFindings.map((f) => ({
    ruleId: f.ruleId,
    severity: f.severity,
    message: `Injection pattern detected: ${f.ruleId}`,
    match: f.match,
    line: f.line,
  }));
}

/** Check if a SEC-AGT finding duplicates an existing finding from the injection engine. */
function isDuplicateFinding(existing: ScanConfigFinding[], secFinding: SecurityFinding): boolean {
  return existing.some(
    (e) =>
      e.line === secFinding.line &&
      e.match === secFinding.match.trim() &&
      e.ruleId.split('-')[0] === secFinding.ruleId.split('-')[0]
  );
}

/** Convert SEC-AGT findings to ScanConfigFinding format, deduplicating against existing. */
function mapSecurityFindings(
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
        line: f.line,
      });
    }
  }
  return result;
}

/** Apply --fix by stripping high-severity lines in-place. */
function applyFix(
  filePath: string,
  targetDir: string,
  content: string,
  injectionFindings: InjectionFinding[]
): void {
  const hasHighSeverity = injectionFindings.some((f) => f.severity === 'high');
  if (!hasHighSeverity) return;

  const { cleaned, linesStripped } = stripHighSeverityPatterns(content, injectionFindings);
  if (linesStripped > 0) {
    writeFileSync(filePath, cleaned);
    logger.info(
      `scan-config --fix: stripped ${linesStripped} high-severity line(s) from ${relative(targetDir, filePath).replaceAll('\\', '/')}`
    );
  }
}

/** Scan a single config file with both engines. */
function scanSingleFile(
  filePath: string,
  targetDir: string,
  scanner: SecurityScanner,
  options: ScanConfigOptions
): ScanConfigFileResult | null {
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

  if (options.fix) {
    applyFix(filePath, targetDir, content, injectionFindings);
  }

  return {
    file: relative(targetDir, filePath).replaceAll('\\', '/'),
    findings,
    overallSeverity: computeOverallSeverity(findings),
  };
}

/**
 * Run config scanning against a directory.
 * Scans CONFIG_FILES for injection patterns (sentinel engine) and SEC-AGT security rules.
 */
export async function runScanConfig(
  targetDir: string,
  options: ScanConfigOptions
): Promise<ScanConfigResult> {
  const scanner = new SecurityScanner(parseSecurityConfig({}));
  const results: ScanConfigFileResult[] = [];

  for (const configFile of CONFIG_FILES) {
    const result = scanSingleFile(join(targetDir, configFile), targetDir, scanner, options);
    if (result) results.push(result);
  }

  return { exitCode: computeExitCode(results), results };
}

/** Format and log text output for scan results. */
function formatTextOutput(result: ScanConfigResult): void {
  if (result.results.length === 0) {
    logger.info('scan-config: no config files found to scan.');
    return;
  }

  for (const fileResult of result.results) {
    if (fileResult.findings.length === 0) {
      logger.info(`${fileResult.file}: clean`);
      continue;
    }
    logger.info(
      `${fileResult.file}: ${fileResult.overallSeverity} (${fileResult.findings.length} finding(s))`
    );
    for (const f of fileResult.findings) {
      const lineInfo = f.line ? ` (line ${f.line})` : '';
      logger.info(`  [${f.ruleId}] ${f.severity.toUpperCase()}: ${f.message}${lineInfo}`);
    }
  }

  if (result.exitCode === 2) {
    logger.error('scan-config: HIGH severity findings detected. Execution should be blocked.');
  } else if (result.exitCode === 1) {
    logger.warn('scan-config: MEDIUM severity findings detected. Session should be tainted.');
  }
}

export function createScanConfigCommand(): Command {
  const command = new Command('scan-config')
    .description(
      'Scan CLAUDE.md, AGENTS.md, .gemini/settings.json, and skill.yaml for prompt injection patterns'
    )
    .option('--path <dir>', 'Target directory to scan', process.cwd())
    .option('--fix', 'Strip high-severity patterns from files in-place')
    .action(async (opts, cmd) => {
      const globalOpts = cmd.optsWithGlobals();
      const mode: OutputModeType = globalOpts.json
        ? OutputMode.JSON
        : globalOpts.quiet
          ? OutputMode.QUIET
          : OutputMode.TEXT;

      const result = await runScanConfig(opts.path, { fix: opts.fix });

      if (mode === OutputMode.JSON) {
        console.log(JSON.stringify(result, null, 2));
      } else if (mode !== OutputMode.QUIET) {
        formatTextOutput(result);
      }

      process.exit(result.exitCode);
    });

  return command;
}
