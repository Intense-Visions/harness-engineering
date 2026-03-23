import { describe, it, expect } from 'vitest';
import { assessProjectDefinition, handleAssessProject } from '../../src/tools/assess-project';

describe('assess_project tool', () => {
  describe('definition', () => {
    it('has correct name', () => {
      expect(assessProjectDefinition.name).toBe('assess_project');
    });

    it('requires path', () => {
      expect(assessProjectDefinition.inputSchema.required).toContain('path');
    });

    it('has optional checks and mode properties', () => {
      const props = assessProjectDefinition.inputSchema.properties;
      expect(props).toHaveProperty('checks');
      expect(props).toHaveProperty('mode');
    });

    it('checks enum has all check names', () => {
      const checksProp = assessProjectDefinition.inputSchema.properties.checks;
      expect(checksProp.items.enum).toEqual([
        'validate',
        'deps',
        'docs',
        'entropy',
        'security',
        'perf',
      ]);
    });

    it('mode defaults to summary for composite', () => {
      const modeProp = assessProjectDefinition.inputSchema.properties.mode;
      expect(modeProp.enum).toEqual(['summary', 'detailed']);
    });
  });

  describe('handler - summary mode', () => {
    it('returns healthy flag and checks array for nonexistent project', async () => {
      const response = await handleAssessProject({
        path: '/nonexistent/project-ap-test',
      });
      expect(response.isError).toBeFalsy();
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed).toHaveProperty('healthy');
      expect(typeof parsed.healthy).toBe('boolean');
      expect(parsed).toHaveProperty('checks');
      expect(Array.isArray(parsed.checks)).toBe(true);
      expect(parsed).toHaveProperty('assessedIn');
      expect(typeof parsed.assessedIn).toBe('number');
    });

    it('each check has name, passed, issueCount', async () => {
      const response = await handleAssessProject({
        path: '/nonexistent/project-ap-test',
      });
      const parsed = JSON.parse(response.content[0].text);
      for (const check of parsed.checks) {
        expect(check).toHaveProperty('name');
        expect(check).toHaveProperty('passed');
        expect(check).toHaveProperty('issueCount');
      }
    });
  });

  describe('handler - checks filter', () => {
    it('only runs specified checks', async () => {
      const response = await handleAssessProject({
        path: '/nonexistent/project-ap-test',
        checks: ['validate'],
      });
      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.checks).toHaveLength(1);
      expect(parsed.checks[0].name).toBe('validate');
    });
  });
});
