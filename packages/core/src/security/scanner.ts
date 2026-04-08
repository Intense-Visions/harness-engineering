import * as fs from 'node:fs/promises';
import { minimatch } from 'minimatch';
import { RuleRegistry } from './rules/registry';
import { resolveRuleSeverity } from './config';
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

interface SuppressionMatch {
  ruleId: string;
  justification: string | null;
}

// Limitation: only supports line comments (// and #). Block comments (/* */ in
// CSS/HTML) are not recognized as suppressions. This is acceptable because most
// security rules target JS/TS/Go/Python files that use line comments.
export function parseHarnessIgnore(line: string, ruleId: string): SuppressionMatch | null {
  if (!line.includes('harness-ignore')) return null;
  if (!line.includes(ruleId)) return null;

  // Match: // harness-ignore SEC-XXX-NNN: justification text
  // Also: # harness-ignore SEC-XXX-NNN: justification text (for non-JS files)
  const match = line.match(/(?:\/\/|#)\s*harness-ignore\s+(SEC-[A-Z]+-\d+)(?::\s*(.+))?/);
  if (match?.[1] !== ruleId) return null;

  const text = match[2]?.trim();
  return { ruleId, justification: text || null };
}

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
      if (!pattern.test(line)) continue;
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

  /** Scan a single line against a resolved rule; push any findings into the array. */
  private scanLineForRule(
    rule: SecurityRule,
    resolved: string,
    line: string,
    lineNumber: number,
    filePath: string,
    findings: SecurityFinding[]
  ): void {
    const suppressionMatch = parseHarnessIgnore(line, rule.id);
    if (suppressionMatch) {
      if (!suppressionMatch.justification) {
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
        this.scanLineForRule(rule, resolved, lines[i] ?? '', startLine + i, filePath, findings);
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
