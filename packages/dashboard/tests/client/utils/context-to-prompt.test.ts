import { describe, it, expect } from 'vitest';
import { generateBriefingSummary, generateSystemPrompt } from '../../../src/client/utils/context-to-prompt';
import type { SkillEntry } from '../../../src/client/types/skills';

const mockSecuritySkill: SkillEntry = {
  id: 'harness:security-scan',
  name: 'Security Scan',
  description: 'Scan codebase for security issues.',
  category: 'security',
  slashCommand: '/harness:security-scan'
};

const mockData = {
  '/api/checks': {
    security: {
      stats: {
        filesScanned: 10,
        errorCount: 2,
        warningCount: 1
      },
      findings: [
        { severity: 'high', ruleId: 'rule-1', file: 'file1.ts', line: 10, message: 'Broken' },
        { severity: 'medium', ruleId: 'rule-2', file: 'file2.ts', line: 20, message: 'Weak' }
      ]
    },
    perf: { stats: { violationCount: 0, filesAnalyzed: 10 }, violations: [] },
    arch: { totalViolations: 0, newViolations: [] }
  }
};

describe('context-to-prompt', () => {
  describe('generateBriefingSummary', () => {
    it('formats security summary correctly', () => {
      const summary = generateBriefingSummary(mockSecuritySkill, mockData);
      expect(summary).toBe('Found 2 errors and 1 warnings across 10 files.');
    });

    it('returns default description if no data', () => {
      const summary = generateBriefingSummary(mockSecuritySkill, {});
      expect(summary).toBe('No specific context data found for this skill.');
    });
  });

  describe('generateSystemPrompt', () => {
    it('includes security details in prompt', () => {
      const prompt = generateSystemPrompt(mockSecuritySkill, mockData);
      expect(prompt).toContain('## Security Context');
      expect(prompt).toContain('[high] rule-1 in file1.ts:10: Broken');
      expect(prompt).toContain('[medium] rule-2 in file2.ts:20: Weak');
    });

    it('includes skill name and goal', () => {
      const prompt = generateSystemPrompt(mockSecuritySkill, mockData);
      expect(prompt).toContain('Security Scan');
      expect(prompt).toContain('Scan codebase for security issues.');
    });
  });
});
