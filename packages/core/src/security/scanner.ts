import * as fs from 'node:fs/promises';
import { minimatch } from 'minimatch';
import { RuleRegistry } from './rules/registry';
import { resolveRuleSeverity } from './config';
import { isReferenceOnlySecretValue, extractQuotedSecretValue } from './secret-reference';
import { detectStack } from './stack-detector';
import { secretRules } from './rules/secrets';
import { injectionRules } from './rules/injection';
import { xssRules } from './rules/xss';
import { cryptoRules } from './rules/crypto';
import { pathTraversalRules } from './rules/path-traversal';
import { networkRules } from './rules/network';
import { deserializationRules } from './rules/deserialization';
import { agentConfigRules } from './rules/agent-config';
import { mcpRules } from './rules/mcp';
import { insecureDefaultsRules } from './rules/insecure-defaults';
import { sharpEdgesRules } from './rules/sharp-edges';
import { nodeRules } from './rules/stack/node';
import { expressRules } from './rules/stack/express';
import { reactRules } from './rules/stack/react';
import { goRules } from './rules/stack/go';
import type { SecurityConfig, SecurityFinding, SecurityRule, ScanResult } from './types';
import { DEFAULT_SECURITY_CONFIG } from './types';
import { parseHarnessIgnore } from './harness-ignore';

// Re-exported so the existing `security/scanner` import path (and index barrel)
// stays stable after the parser was extracted to its dependency-free module.
export { parseHarnessIgnore } from './harness-ignore';

export class SecurityScanner {
  private registry: RuleRegistry;
  private config: SecurityConfig;
  private activeRules: SecurityRule[] = [];

  constructor(config: Partial<SecurityConfig> = {}) {
    this.config = { ...DEFAULT_SECURITY_CONFIG, ...config };
    this.registry = new RuleRegistry();

    // Register all base rules
    this.registry.registerAll([
      ...secretRules,
      ...injectionRules,
      ...xssRules,
      ...cryptoRules,
      ...pathTraversalRules,
      ...networkRules,
      ...deserializationRules,
      ...agentConfigRules,
      ...mcpRules,
      ...insecureDefaultsRules,
      ...sharpEdgesRules,
    ]);

    // Register stack-specific rules
    this.registry.registerAll([...nodeRules, ...expressRules, ...reactRules, ...goRules]);

    // All rules active initially; filtered by stack via configureForProject()
    this.activeRules = this.registry.getAll();
  }

  configureForProject(projectRoot: string): void {
    const stacks = detectStack(projectRoot);
    this.activeRules = this.registry.getForStacks(stacks.length > 0 ? stacks : []);
  }

  /**
   * Scan raw content against all active rules. Note: this method does NOT apply
   * fileGlob filtering — every active rule is evaluated regardless of filePath.
   * If you are scanning a specific file and want fileGlob-based rule filtering,
   * use {@link scanFile} instead.
   */
  scanContent(content: string, filePath: string, startLine: number = 1): SecurityFinding[] {
    if (!this.config.enabled) return [];
    const lines = content.split('\n');
    return this.scanLinesWithRules(lines, this.activeRules, filePath, startLine);
  }

  async scanFile(filePath: string): Promise<SecurityFinding[]> {
    if (!this.config.enabled) return [];
    const content = await fs.readFile(filePath, 'utf-8');
    return this.scanContentForFile(content, filePath, 1);
  }

  /**
   * Scan in-memory content for a specific `filePath`, applying the same
   * `fileGlob` rule filtering as {@link scanFile} — unlike {@link scanContent},
   * which fires every active rule regardless of path. Use this to scan content
   * you already hold (e.g. a diff's added lines) without a disk read; `startLine`
   * offsets the reported line numbers to the content's true position.
   */
  scanFileContent(content: string, filePath: string, startLine = 1): SecurityFinding[] {
    return this.scanContentForFile(content, filePath, startLine);
  }

  private scanContentForFile(
    content: string,
    filePath: string,
    startLine: number = 1
  ): SecurityFinding[] {
    if (!this.config.enabled) return [];
    const lines = content.split('\n');

    // Filter rules by fileGlob when scanning a specific file
    const applicableRules = this.activeRules.filter((rule) => {
      if (!rule.fileGlob) return true;
      // fileGlob can be comma-separated patterns
      const globs = rule.fileGlob.split(',').map((g) => g.trim());
      return globs.some((glob) => minimatch(filePath, glob, { dot: true }));
    });

    return this.scanLinesWithRules(lines, applicableRules, filePath, startLine);
  }

  /** Build a finding for a suppression comment that is missing its justification. */
  private buildSuppressionFinding(
    rule: SecurityRule,
    filePath: string,
    lineNumber: number,
    line: string
  ): SecurityFinding {
    return {
      ruleId: rule.id,
      ruleName: rule.name,
      category: rule.category,
      severity: this.config.strict ? 'error' : 'warning',
      confidence: 'high',
      file: filePath,
      line: lineNumber,
      match: line.trim(),
      context: line,
      message: `Suppression of ${rule.id} requires justification: // harness-ignore ${rule.id}: <reason>`,
      remediation: `Add justification after colon: // harness-ignore ${rule.id}: false positive because ...`,
    };
  }

  /** Check one line against a rule's patterns; return a finding or null. */
  private matchRuleLine(
    rule: SecurityRule,
    resolved: string,
    filePath: string,
    lineNumber: number,
    line: string
  ): SecurityFinding | null {
    for (const pattern of rule.patterns) {
      pattern.lastIndex = 0; // Reset regex lastIndex for global/sticky patterns
      const match = pattern.exec(line);
      if (!match) continue;
      // Secret rules match assignment shapes like `TOKEN="..."`. When the value
      // is a variable/expression reference (`$VAR`, `${{ secrets.X }}`) rather
      // than a literal, nothing is embedded in source — the secret is resolved
      // at runtime — so a "hardcoded secret" finding here is a false positive.
      if (rule.category === 'secrets') {
        const value = extractQuotedSecretValue(match[0]);
        if (value !== null && isReferenceOnlySecretValue(value)) continue;
      }
      return {
        ruleId: rule.id,
        ruleName: rule.name,
        category: rule.category,
        severity: resolved as SecurityFinding['severity'],
        confidence: rule.confidence,
        file: filePath,
        line: lineNumber,
        match: line.trim(),
        context: line,
        message: rule.message,
        remediation: rule.remediation,
        ...(rule.references ? { references: rule.references } : {}),
      };
    }
    return null;
  }

  /**
   * Scan a single line against a resolved rule; push any findings into the array.
   *
   * Suppression check is two-pass: same line first (trailing-comment style), then the previous
   * line (the dominant convention: `// harness-ignore` on the line above the flagged code).
   * Without the prior-line check, every multi-line statement annotated using the over-the-top
   * convention would slip through and re-trigger the finding.
   */
  private scanLineForRule(
    rule: SecurityRule,
    resolved: string,
    line: string,
    lineNumber: number,
    filePath: string,
    findings: SecurityFinding[],
    priorLine?: string
  ): void {
    const sameLineMatch = parseHarnessIgnore(line, rule.id);
    const priorLineMatch =
      !sameLineMatch && priorLine !== undefined ? parseHarnessIgnore(priorLine, rule.id) : null;
    const suppressionMatch = sameLineMatch ?? priorLineMatch;
    if (suppressionMatch) {
      // Emit the "needs justification" finding only when the annotation is on
      // the current line. If it's on the prior line, that line's own same-line
      // pass already produced one — don't double-count.
      if (!suppressionMatch.justification && sameLineMatch !== null) {
        findings.push(this.buildSuppressionFinding(rule, filePath, lineNumber, line));
      }
      return;
    }
    const finding = this.matchRuleLine(rule, resolved, filePath, lineNumber, line);
    if (finding) findings.push(finding);
  }

  /**
   * Core scanning loop shared by scanContent and scanContentForFile.
   * Evaluates each rule against each line, handling suppression (FP gate)
   * and pattern matching uniformly.
   */
  private scanLinesWithRules(
    lines: string[],
    rules: SecurityRule[],
    filePath: string,
    startLine: number
  ): SecurityFinding[] {
    const findings: SecurityFinding[] = [];

    for (const rule of rules) {
      const resolved = resolveRuleSeverity(
        rule.id,
        rule.severity,
        this.config.rules ?? {},
        this.config.strict
      );
      if (resolved === 'off') continue;

      for (let i = 0; i < lines.length; i++) {
        this.scanLineForRule(
          rule,
          resolved,
          lines[i] ?? '',
          startLine + i,
          filePath,
          findings,
          i > 0 ? lines[i - 1] : undefined
        );
      }
    }

    return findings;
  }

  async scanFiles(filePaths: string[]): Promise<ScanResult> {
    const allFindings: SecurityFinding[] = [];
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
      rulesApplied: this.activeRules.length,
      externalToolsUsed: [],
      coverage: 'baseline',
    };
  }
}
