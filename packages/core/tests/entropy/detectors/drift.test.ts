import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  findPossibleMatches,
  levenshteinDistance,
  detectDocDrift,
} from '../../../src/entropy/detectors/drift';
import { buildSnapshot } from '../../../src/entropy/snapshot';
import { TypeScriptParser } from '../../../src/shared/parsers';
import { join } from 'path';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';

describe('fuzzy matching', () => {
  describe('levenshteinDistance', () => {
    it('should return 0 for identical strings', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0);
    });

    it('should calculate distance for similar strings', () => {
      expect(levenshteinDistance('getUserById', 'findUserById')).toBeLessThan(10);
    });
  });

  describe('findPossibleMatches', () => {
    const exports = ['findUserById', 'createNewUser', 'validateEmail', 'User'];

    it('should find similar names', () => {
      const matches = findPossibleMatches('getUserById', exports);
      expect(matches).toContain('findUserById');
    });

    it('should find prefix matches', () => {
      const matches = findPossibleMatches('createUser', exports);
      expect(matches).toContain('createNewUser');
    });

    it('should return empty for no matches', () => {
      const matches = findPossibleMatches('totallyDifferent', exports);
      expect(matches.length).toBe(0);
    });
  });
});

describe('detectDocDrift', () => {
  const parser = new TypeScriptParser();
  const driftFixtures = join(__dirname, '../../fixtures/entropy/drift-samples');

  it('should detect API signature drift', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: driftFixtures,
      parser,
      analyze: { drift: true },
      include: ['src/**/*.ts'],
      docPaths: ['docs/**/*.md'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const result = await detectDocDrift(snapshotResult.value, {
      checkApiSignatures: true,
      checkExamples: false,
      checkStructure: false,
      docPaths: [],
      ignorePatterns: [],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.drifts.length).toBeGreaterThan(0);

      const apiDrifts = result.value.drifts.filter((d) => d.type === 'api-signature');
      expect(apiDrifts.some((d) => d.reference === 'getUserById')).toBe(true);
      expect(apiDrifts.some((d) => d.possibleMatches?.includes('findUserById'))).toBe(true);
    }
  });

  it('should detect structure drift (broken file links)', async () => {
    const snapshotResult = await buildSnapshot({
      rootDir: driftFixtures,
      parser,
      analyze: { drift: true },
      include: ['src/**/*.ts'],
      docPaths: ['docs/**/*.md'],
    });

    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return;

    const result = await detectDocDrift(snapshotResult.value, {
      checkApiSignatures: false,
      checkExamples: false,
      checkStructure: true,
      docPaths: [],
      ignorePatterns: [],
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      const structureDrifts = result.value.drifts.filter((d) => d.type === 'structure');
      expect(structureDrifts.some((d) => d.reference.includes('missing-file.ts'))).toBe(true);
    }
  });
});

// Regression: github issue #492. ADR-heavy projects emitted 38/41 false
// positives across three categories — forward-looking refs, file-name
// backticks/locales (extraction-layer), and anchor links. Tests below cover
// the drift-detector-layer fixes (forward-looking suppression and
// anchor-aware link parsing).
describe('drift detector — issue #492 regressions', () => {
  const parser = new TypeScriptParser();
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'drift-492-'));
    await mkdir(join(projectDir, 'src'), { recursive: true });
    await mkdir(join(projectDir, 'docs', 'architecture', 'persistence'), { recursive: true });
    await writeFile(
      join(projectDir, 'src', 'index.ts'),
      'export function realFunction() { return 1; }\n'
    );
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  describe('forward-looking docs (ADRs, decisions, proposals)', () => {
    it('suppresses api-signature drift for symbols inside docs/architecture/**', async () => {
      await writeFile(
        join(projectDir, 'docs', 'architecture', 'persistence', 'ADR-0001-future.md'),
        [
          '# ADR-0001: Future persistence',
          '',
          'We will introduce `IssueReward`, `IssuePoints`, `BAO_SENT`, `defer_response`',
          'and `respond_later` symbols. None of these exist in the codebase yet.',
        ].join('\n')
      );

      const snapshotResult = await buildSnapshot({
        rootDir: projectDir,
        parser,
        analyze: { drift: true },
        include: ['src/**/*.ts'],
        docPaths: ['docs/**/*.md'],
      });
      expect(snapshotResult.ok).toBe(true);
      if (!snapshotResult.ok) return;

      const result = await detectDocDrift(snapshotResult.value, {
        checkApiSignatures: true,
        checkExamples: false,
        checkStructure: false,
        docPaths: [],
        ignorePatterns: [],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const apiDrifts = result.value.drifts.filter((d) => d.type === 'api-signature');
      expect(apiDrifts).toHaveLength(0);
    });

    it('still surfaces api-signature drift for refs in non-forward-looking docs', async () => {
      await mkdir(join(projectDir, 'docs', 'reference'), { recursive: true });
      await writeFile(
        join(projectDir, 'docs', 'reference', 'api.md'),
        '# API\n\nSee `IssueReward` for details.\n'
      );

      const snapshotResult = await buildSnapshot({
        rootDir: projectDir,
        parser,
        analyze: { drift: true },
        include: ['src/**/*.ts'],
        docPaths: ['docs/**/*.md'],
      });
      expect(snapshotResult.ok).toBe(true);
      if (!snapshotResult.ok) return;

      const result = await detectDocDrift(snapshotResult.value, {
        checkApiSignatures: true,
        checkExamples: false,
        checkStructure: false,
        docPaths: [],
        ignorePatterns: [],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const apiDrifts = result.value.drifts.filter((d) => d.type === 'api-signature');
      expect(apiDrifts.some((d) => d.reference === 'IssueReward')).toBe(true);
    });

    it('respects a custom forwardLookingPaths override', async () => {
      await mkdir(join(projectDir, 'docs', 'rfcs'), { recursive: true });
      await writeFile(
        join(projectDir, 'docs', 'rfcs', 'rfc-001.md'),
        '# RFC 001\n\nIntroduces `FuturePlannedSymbol`.\n'
      );

      const snapshotResult = await buildSnapshot({
        rootDir: projectDir,
        parser,
        analyze: { drift: true },
        include: ['src/**/*.ts'],
        docPaths: ['docs/**/*.md'],
      });
      expect(snapshotResult.ok).toBe(true);
      if (!snapshotResult.ok) return;

      const result = await detectDocDrift(snapshotResult.value, {
        checkApiSignatures: true,
        checkExamples: false,
        checkStructure: false,
        docPaths: [],
        ignorePatterns: [],
        forwardLookingPaths: ['docs/rfcs/'],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const apiDrifts = result.value.drifts.filter((d) => d.type === 'api-signature');
      expect(apiDrifts).toHaveLength(0);
    });
  });

  describe('anchor-aware link parsing', () => {
    it('treats file.md#anchor as link to file.md (file existence passes)', async () => {
      await writeFile(
        join(projectDir, 'docs', 'index.md'),
        [
          '# Index',
          '',
          '- [Architecture](architecture/persistence/ADR-0001-with-anchors.md#section-one)',
        ].join('\n')
      );
      await writeFile(
        join(projectDir, 'docs', 'architecture', 'persistence', 'ADR-0001-with-anchors.md'),
        ['# ADR-0001', '', '## Section One', '', 'Body.'].join('\n')
      );

      const snapshotResult = await buildSnapshot({
        rootDir: projectDir,
        parser,
        analyze: { drift: true },
        include: ['src/**/*.ts'],
        docPaths: ['docs/**/*.md'],
      });
      expect(snapshotResult.ok).toBe(true);
      if (!snapshotResult.ok) return;

      const result = await detectDocDrift(snapshotResult.value, {
        checkApiSignatures: false,
        checkExamples: false,
        checkStructure: true,
        docPaths: [],
        ignorePatterns: [],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // No structure drift expected — file exists and anchor exists.
      const structureDrifts = result.value.drifts.filter((d) => d.type === 'structure');
      expect(structureDrifts).toHaveLength(0);
    });

    it('emits anchor drift when file exists but anchor does not match any heading', async () => {
      // Real-world variant from the reporter: em-dash slug typo.
      await writeFile(
        join(projectDir, 'docs', 'index.md'),
        '[bad](architecture/persistence/ADR-0001-anchor-typo.md#nonexistent-anchor)\n'
      );
      await writeFile(
        join(projectDir, 'docs', 'architecture', 'persistence', 'ADR-0001-anchor-typo.md'),
        ['# ADR-0001', '', '## Real Section', '', 'Body.'].join('\n')
      );

      const snapshotResult = await buildSnapshot({
        rootDir: projectDir,
        parser,
        analyze: { drift: true },
        include: ['src/**/*.ts'],
        docPaths: ['docs/**/*.md'],
      });
      expect(snapshotResult.ok).toBe(true);
      if (!snapshotResult.ok) return;

      const result = await detectDocDrift(snapshotResult.value, {
        checkApiSignatures: false,
        checkExamples: false,
        checkStructure: true,
        docPaths: [],
        ignorePatterns: [],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const structureDrifts = result.value.drifts.filter((d) => d.type === 'structure');
      expect(structureDrifts).toHaveLength(1);
      expect(structureDrifts[0]?.context).toBe('link-anchor');
      expect(structureDrifts[0]?.details).toContain('nonexistent-anchor');
    });

    it('still emits file-not-found drift when the file portion is missing', async () => {
      await writeFile(
        join(projectDir, 'docs', 'index.md'),
        '[missing](architecture/does-not-exist.md#anything)\n'
      );

      const snapshotResult = await buildSnapshot({
        rootDir: projectDir,
        parser,
        analyze: { drift: true },
        include: ['src/**/*.ts'],
        docPaths: ['docs/**/*.md'],
      });
      expect(snapshotResult.ok).toBe(true);
      if (!snapshotResult.ok) return;

      const result = await detectDocDrift(snapshotResult.value, {
        checkApiSignatures: false,
        checkExamples: false,
        checkStructure: true,
        docPaths: [],
        ignorePatterns: [],
      });
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const structureDrifts = result.value.drifts.filter((d) => d.type === 'structure');
      expect(structureDrifts).toHaveLength(1);
      expect(structureDrifts[0]?.context).toBe('link');
      expect(structureDrifts[0]?.details).toContain('does-not-exist.md');
    });
  });
});

// Regression: github issue #816. On docs-heavy repos `harness cleanup --type
// drift` produced ~100% false positives (36,697 findings), because every
// backtick token was resolved against top-level exports. These tests lock in
// the detector-layer fixes: docs/changes/** forward-looking suppression and
// head-segment resolution of dotted member references.
describe('drift detector — issue #816 regressions', () => {
  const parser = new TypeScriptParser();
  let projectDir: string;

  beforeEach(async () => {
    projectDir = await mkdtemp(join(tmpdir(), 'drift-816-'));
    await mkdir(join(projectDir, 'src'), { recursive: true });
    // `User` is a real top-level export; `email` is only a member of it.
    await writeFile(
      join(projectDir, 'src', 'index.ts'),
      'export class User { email = ""; }\nexport function createUser() { return new User(); }\n'
    );
  });

  afterEach(async () => {
    await rm(projectDir, { recursive: true, force: true });
  });

  async function driftFor(docPaths: string[]) {
    const snapshotResult = await buildSnapshot({
      rootDir: projectDir,
      parser,
      analyze: { drift: true },
      include: ['src/**/*.ts'],
      docPaths: ['docs/**/*.md'],
    });
    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return [];
    const result = await detectDocDrift(snapshotResult.value, {
      checkApiSignatures: true,
      checkExamples: false,
      checkStructure: false,
      docPaths,
      ignorePatterns: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return [];
    return result.value.drifts.filter((d) => d.type === 'api-signature');
  }

  it('suppresses api-signature drift for symbols inside docs/changes/**', async () => {
    await mkdir(join(projectDir, 'docs', 'changes', 'my-feature'), { recursive: true });
    await writeFile(
      join(projectDir, 'docs', 'changes', 'my-feature', 'proposal.md'),
      '# Proposal\n\nWe will add `ProposedThing` and `FutureService`. Neither exists yet.\n'
    );
    const apiDrifts = await driftFor([]);
    expect(apiDrifts).toHaveLength(0);
  });

  it('does not flag member access on a symbol that resolves by its head (User.email)', async () => {
    await mkdir(join(projectDir, 'docs', 'reference'), { recursive: true });
    await writeFile(
      join(projectDir, 'docs', 'reference', 'api.md'),
      '# API\n\nRead `User.email` from the `createUser` result.\n'
    );
    const apiDrifts = await driftFor([]);
    expect(apiDrifts.some((d) => d.reference === 'User.email')).toBe(false);
    expect(apiDrifts.some((d) => d.reference === 'createUser')).toBe(false);
  });

  it('still flags a dotted reference whose head does not resolve', async () => {
    await mkdir(join(projectDir, 'docs', 'reference'), { recursive: true });
    await writeFile(
      join(projectDir, 'docs', 'reference', 'api.md'),
      '# API\n\nCall `Ghost.method` on the missing type.\n'
    );
    const apiDrifts = await driftFor([]);
    expect(apiDrifts.some((d) => d.reference === 'Ghost.method')).toBe(true);
  });

  it('suppresses snake_case tokens when the codebase has no snake_case exports', async () => {
    // The beforeEach fixture exports only camelCase/PascalCase symbols, so a
    // snake_case doc token (MCP tool / config key) cannot be one of them.
    await mkdir(join(projectDir, 'docs', 'reference'), { recursive: true });
    await writeFile(
      join(projectDir, 'docs', 'reference', 'mcp.md'),
      '# MCP\n\nCall the `assess_project` and `check_docs` tools.\n'
    );
    const apiDrifts = await driftFor([]);
    expect(apiDrifts.some((d) => d.reference === 'assess_project')).toBe(false);
    expect(apiDrifts.some((d) => d.reference === 'check_docs')).toBe(false);
  });

  it('still flags snake_case drift when the codebase DOES export snake_case', async () => {
    // A project that uses snake_case for real symbols keeps snake_case checks.
    await writeFile(join(projectDir, 'src', 'snake.ts'), 'export const real_export = 1;\n');
    await mkdir(join(projectDir, 'docs', 'reference'), { recursive: true });
    await writeFile(
      join(projectDir, 'docs', 'reference', 'api.md'),
      '# API\n\nUse `real_export`; the old `gone_helper` was removed.\n'
    );
    const apiDrifts = await driftFor([]);
    expect(apiDrifts.some((d) => d.reference === 'gone_helper')).toBe(true);
    expect(apiDrifts.some((d) => d.reference === 'real_export')).toBe(false);
  });
});

// Regression: github issue #1342 / #1332. The structure-drift link extractor
// has no fenced-code-block tracking, so links written *inside* ```fences``` as
// documentation examples are checked for existence and reported as broken.
// Separately, slugifyHeading() collapses whitespace runs with /\s+/ where
// GitHub emits one hyphen per space, so a heading like "Tips & Tricks" (whose
// real GitHub anchor is `tips--tricks`) is reconstructed as `tips-tricks` and a
// working anchor is flagged. 27/27 false positives were reported on canary.
describe('drift detector — issue #1342/#1332 regressions', () => {
  const parser2 = new TypeScriptParser();
  let projectDir1342: string;

  beforeEach(async () => {
    projectDir1342 = await mkdtemp(join(tmpdir(), 'drift-1342-'));
    await mkdir(join(projectDir1342, 'src'), { recursive: true });
    await mkdir(join(projectDir1342, 'docs'), { recursive: true });
    await writeFile(
      join(projectDir1342, 'src', 'index.ts'),
      'export function realFunction() { return 1; }\n'
    );
  });

  afterEach(async () => {
    await rm(projectDir1342, { recursive: true, force: true });
  });

  async function structureDriftFor() {
    const snapshotResult = await buildSnapshot({
      rootDir: projectDir1342,
      parser: parser2,
      analyze: { drift: true },
      include: ['src/**/*.ts'],
      docPaths: ['docs/**/*.md'],
    });
    expect(snapshotResult.ok).toBe(true);
    if (!snapshotResult.ok) return [];
    const result = await detectDocDrift(snapshotResult.value, {
      checkApiSignatures: false,
      checkExamples: false,
      checkStructure: true,
      docPaths: [],
      ignorePatterns: [],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return [];
    return result.value.drifts.filter((d) => d.type === 'structure');
  }

  it('does not flag a link written inside a fenced code block', async () => {
    await writeFile(
      join(projectDir1342, 'docs', 'guide.md'),
      [
        '# Guide',
        '',
        'To wire it up, add a link like this:',
        '',
        '```markdown',
        'See [the config](./this-file-does-not-exist.md) for details.',
        '```',
        '',
        'That is only an illustration.',
      ].join('\n')
    );

    const structureDrifts = await structureDriftFor();
    // The link lives inside a ```fence``` — documentation, not a real
    // reference, and must not be reported as a broken link.
    expect(structureDrifts).toHaveLength(0);
  });

  it('reconstructs a "Foo & Bar" heading anchor the way GitHub does', async () => {
    await writeFile(join(projectDir1342, 'docs', 'index.md'), '[tricks](./page.md#tips--tricks)\n');
    await writeFile(
      join(projectDir1342, 'docs', 'page.md'),
      ['# Page', '', '## Tips & Tricks', '', 'Body.'].join('\n')
    );

    const structureDrifts = await structureDriftFor();
    // GitHub renders "## Tips & Tricks" as the anchor `tips--tricks` (one hyphen
    // per space). The link targets exactly that, so nothing is broken.
    expect(structureDrifts).toHaveLength(0);
  });
});
