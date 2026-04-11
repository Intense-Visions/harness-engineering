import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { normalizeSkills } from '../../src/slash-commands/normalize';

const fixturesDir = path.join(__dirname, 'fixtures');

describe('normalizeSkills', () => {
  it('normalizes a valid skill into a SlashCommandSpec', () => {
    const specs = normalizeSkills([{ dir: fixturesDir, source: 'project' }], ['claude-code']);
    const spec = specs.find((s) => s.skillYamlName === 'harness-test-skill');

    expect(spec).toBeDefined();
    expect(spec!.name).toBe('test-skill');
    expect(spec!.namespace).toBe('harness');
    expect(spec!.fullName).toBe('harness:test-skill');
    expect(spec!.description).toBe('A test skill for unit tests');
    expect(spec!.cognitiveMode).toBe('meticulous-implementer');
    expect(spec!.tools).toContain('Read');
    expect(spec!.args).toHaveLength(1);
    expect(spec!.args[0].name).toBe('path');
    expect(spec!.sourceDir).toBe('valid-skill');
  });

  it('includes Read in tools even if not in skill.yaml', () => {
    const specs = normalizeSkills([{ dir: fixturesDir, source: 'project' }], ['claude-code']);
    const spec = specs.find((s) => s.skillYamlName === 'harness-test-skill');
    expect(spec!.tools).toContain('Read');
  });

  it('filters out skills that do not match target platform', () => {
    const specs = normalizeSkills([{ dir: fixturesDir, source: 'project' }], ['claude-code']);
    const noPlat = specs.find((s) => s.skillYamlName === 'no-platform-skill');
    expect(noPlat).toBeUndefined();
  });

  it('generates prompt.context with cognitive mode and type', () => {
    const specs = normalizeSkills([{ dir: fixturesDir, source: 'project' }], ['claude-code']);
    const spec = specs.find((s) => s.skillYamlName === 'harness-test-skill');
    expect(spec!.prompt.context).toContain('meticulous-implementer');
    expect(spec!.prompt.context).toContain('rigid');
  });

  it('generates prompt.objective from description and phases', () => {
    const specs = normalizeSkills([{ dir: fixturesDir, source: 'project' }], ['claude-code']);
    const spec = specs.find((s) => s.skillYamlName === 'harness-test-skill');
    expect(spec!.prompt.objective).toContain('A test skill for unit tests');
    expect(spec!.prompt.objective).toContain('execute');
  });

  it('generates prompt.process with MCP-first logic', () => {
    const specs = normalizeSkills([{ dir: fixturesDir, source: 'project' }], ['claude-code']);
    const spec = specs.find((s) => s.skillYamlName === 'harness-test-skill');
    expect(spec!.prompt.process).toContain('mcp__harness__run_skill');
    expect(spec!.prompt.process).toContain('harness-test-skill');
  });

  it('handles skills with missing SKILL.md gracefully', () => {
    const specs = normalizeSkills([{ dir: fixturesDir, source: 'project' }], ['claude-code']);
    const spec = specs.find((s) => s.skillYamlName === 'harness-no-md');
    expect(spec).toBeDefined();
    expect(spec!.prompt.executionContext).toBe('');
  });

  it('defaults args to empty array when cli is absent', () => {
    const specs = normalizeSkills([{ dir: fixturesDir, source: 'project' }], ['claude-code']);
    const spec = specs.find((s) => s.skillYamlName === 'harness-no-md');
    expect(spec!.args).toEqual([]);
  });

  it('does not throw when no collisions exist', () => {
    expect(() =>
      normalizeSkills([{ dir: fixturesDir, source: 'project' }], ['claude-code'])
    ).not.toThrow();
  });

  it('uses command_namespace for namespace and fullName', () => {
    const specs = normalizeSkills([{ dir: fixturesDir, source: 'project' }], ['claude-code']);
    const spec = specs.find((s) => s.skillYamlName === 'acme-tools');

    expect(spec).toBeDefined();
    expect(spec!.namespace).toBe('acme');
    expect(spec!.name).toBe('tools');
    expect(spec!.fullName).toBe('acme:tools');
    expect(spec!.customNamespace).toBe('acme');
  });

  it('defaults to harness namespace when command_namespace is not set', () => {
    const specs = normalizeSkills([{ dir: fixturesDir, source: 'project' }], ['claude-code']);
    const spec = specs.find((s) => s.skillYamlName === 'harness-test-skill');

    expect(spec).toBeDefined();
    expect(spec!.namespace).toBe('harness');
    expect(spec!.fullName).toBe('harness:test-skill');
    expect(spec!.customNamespace).toBeUndefined();
  });
});
