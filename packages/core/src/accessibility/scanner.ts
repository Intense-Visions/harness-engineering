import * as fs from 'node:fs/promises';
import { extname } from 'node:path';
import { ariaRules } from './rules';
import { ARIA_SCANNABLE_EXTENSIONS } from './types';
import type { AriaFinding, AriaRule, AriaScanResult } from './types';

/**
 * Mechanical ARIA scanner — the load-bearing implementation of the two
 * decidable checks promoted out of the `a11y-aria-patterns` advisory skill.
 *
 * Modeled on {@link SecurityScanner}: regex rules evaluated per line, one
 * finding per match. `harness-accessibility` invokes this exactly the way
 * `harness-security-scan` invokes the security scanner — the skill's SCAN phase
 * calls {@link AriaScanner.scanFiles} rather than eyeballing grep output for
 * A11Y-014 / A11Y-042.
 */
export class AriaScanner {
  private readonly rules: AriaRule[];

  constructor(rules: AriaRule[] = ariaRules) {
    this.rules = rules;
  }

  /** Scan raw content for a given file path. `startLine` offsets reported lines. */
  scanContent(content: string, filePath: string, startLine = 1): AriaFinding[] {
    const findings: AriaFinding[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] ?? '';
      for (const rule of this.rules) {
        if (this.ruleMatchesLine(rule, line)) {
          findings.push(this.buildFinding(rule, filePath, startLine + i, line));
        }
      }
    }

    return findings;
  }

  /** True if any of the rule's patterns match the line (one finding per rule per line). */
  private ruleMatchesLine(rule: AriaRule, line: string): boolean {
    return rule.patterns.some((pattern) => {
      pattern.lastIndex = 0;
      return pattern.test(line);
    });
  }

  private buildFinding(rule: AriaRule, file: string, line: number, raw: string): AriaFinding {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      confidence: rule.confidence,
      file,
      line,
      match: raw.trim(),
      message: rule.message,
      remediation: rule.remediation,
      ...(rule.references ? { references: rule.references } : {}),
    };
  }

  async scanFile(filePath: string): Promise<AriaFinding[]> {
    if (!ARIA_SCANNABLE_EXTENSIONS.includes(extname(filePath).toLowerCase())) {
      return [];
    }
    const content = await fs.readFile(filePath, 'utf-8');
    return this.scanContent(content, filePath, 1);
  }

  async scanFiles(filePaths: string[]): Promise<AriaScanResult> {
    const allFindings: AriaFinding[] = [];
    let scannedCount = 0;

    for (const filePath of filePaths) {
      try {
        const findings = await this.scanFile(filePath);
        allFindings.push(...findings);
        scannedCount++;
      } catch {
        // Skip unreadable files (permission errors, binary files, etc.)
      }
    }

    return {
      findings: allFindings,
      scannedFiles: scannedCount,
      rulesApplied: this.rules.length,
    };
  }
}
