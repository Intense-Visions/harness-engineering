import { describe, it, expect, vi, afterEach } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';

describe('resolveSkillsDir', () => {
  const originalCwd = process.cwd;

  afterEach(() => {
    process.cwd = originalCwd;
    vi.restoreAllMocks();
  });

  it('resolves skills directory containing agents/skills/claude-code', async () => {
    const { resolveSkillsDir } = await import('../../../src/utils/paths.js');
    const skillsDir = resolveSkillsDir();
    expect(skillsDir).toContain(path.join('agents', 'skills', 'claude-code'));
  });

  it('resolves to a directory where harness-soundness-review skill exists', async () => {
    const { resolveSkillsDir } = await import('../../../src/utils/paths.js');
    const skillsDir = resolveSkillsDir();
    const soundnessPath = path.join(skillsDir, 'harness-soundness-review');
    expect(fs.existsSync(soundnessPath)).toBe(true);
  });

  it('falls back to cwd-based resolution', async () => {
    const projectRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
    process.cwd = () => projectRoot;

    const { resolveSkillsDir } = await import('../../../src/utils/paths.js');
    const skillsDir = resolveSkillsDir();
    expect(skillsDir).toContain(path.join('agents', 'skills', 'claude-code'));
  });

  it('resolves skills from CLI bundled assets when available', async () => {
    // The CLI bundles skills into dist/agents/skills/claude-code/
    const cliSkillsDir = path.resolve(
      __dirname,
      '..',
      '..',
      '..',
      'dist',
      'agents',
      'skills',
      'claude-code'
    );
    if (!fs.existsSync(cliSkillsDir)) {
      // CLI not built — skip (CI may not have built CLI yet)
      return;
    }
    // Verify the CLI bundled skills directory has actual skills
    const entries = fs.readdirSync(cliSkillsDir);
    expect(entries.length).toBeGreaterThan(0);
  });
});

describe('resolvePersonasDir', () => {
  it('resolves personas directory', async () => {
    const { resolvePersonasDir } = await import('../../../src/utils/paths.js');
    const personasDir = resolvePersonasDir();
    expect(personasDir).toContain(path.join('agents', 'personas'));
  });
});

describe('resolveTemplatesDir', () => {
  it('resolves templates directory', async () => {
    const { resolveTemplatesDir } = await import('../../../src/utils/paths.js');
    const templatesDir = resolveTemplatesDir();
    expect(templatesDir).toContain('templates');
  });
});
