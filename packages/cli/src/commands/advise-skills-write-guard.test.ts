import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runAdviseSkills, createAdviseSkillsCommand } from './advise-skills';
import type { ContentMatchResult, SkillMatch } from '../skill/content-matcher-types';

/**
 * Regression guard for #1916 / CLI-R004 — `advise-skills` wrote `SKILLS.md`
 * next to the user's spec on EVERY invocation, with no guard, no preview, and
 * no flag able to suppress it. A pre-existing hand-edited `SKILLS.md` was
 * silently clobbered.
 *
 * Deliberately the mirror image of the sibling `advise-skills.test.ts`: that
 * suite mocks `node:fs` to pin the command's glue logic, so it can only observe
 * that `writeFileSync` was *called*. The defect here is about a file appearing
 * on disk, so this suite leaves `node:fs` REAL and asserts against an actual
 * temp directory. Only the expensive, machine-dependent collaborators (skill
 * index build, signal extraction, matching, markdown generation, config
 * resolution) are mocked — which also keeps `loadOrRebuildIndex` from writing
 * its `.harness/skills-index.json` cache anywhere.
 *
 * The two directions both matter and are both asserted:
 *  - `dryRun` must write NOTHING (the fix);
 *  - the DEFAULT must still write (the contract the MCP twin
 *    `mcp/tools/advise-skills.ts` and `harness-planning/SKILL.md` depend on —
 *    the write is opt-OUT, never opt-in).
 */

const hoisted = vi.hoisted(() => ({
  extractSignalsMock: vi.fn(),
  matchContentMock: vi.fn(),
  loadOrRebuildIndexMock: vi.fn(),
  generateSkillsMdMock: vi.fn(),
  resolveConfigMock: vi.fn(),
  infoMock: vi.fn(),
  errorMock: vi.fn(),
}));

vi.mock('../skill/index-builder', () => ({
  loadOrRebuildIndex: hoisted.loadOrRebuildIndexMock,
}));
vi.mock('../skill/signal-extractor', () => ({
  extractSignals: hoisted.extractSignalsMock,
}));
vi.mock('../skill/content-matcher', () => ({
  matchContent: hoisted.matchContentMock,
}));
vi.mock('../skill/skills-md-writer', () => ({
  generateSkillsMd: hoisted.generateSkillsMdMock,
}));
vi.mock('../config/loader', () => ({
  resolveConfig: hoisted.resolveConfigMock,
}));
vi.mock('../output/logger', () => ({
  logger: { info: hoisted.infoMock, error: hoisted.errorMock },
}));

const SPEC_BODY = '# Add Login Flow\n\nBuild a secure authentication feature.\n';
const GENERATED_MD = '# Recommended Skills: Add Login Flow\n\ngenerated body\n';
const HAND_EDITED = 'I AM A HAND-EDITED FILE. DO NOT CLOBBER ME.\n';

function makeMatch(): SkillMatch {
  return {
    skillName: 'skill-a',
    score: 0.9,
    tier: 'apply',
    matchReasons: ['reason'],
    category: 'design',
    when: 'during build',
  };
}

function makeResult(): ContentMatchResult {
  return {
    matches: [makeMatch()],
    signalsUsed: { specKeywords: ['auth'], specText: '', stackSignals: [], featureDomain: [] },
    scanDuration: 12,
  };
}

/** A real on-disk project: `<tmp>/docs/changes/feat/proposal.md`. */
interface Fixture {
  cwd: string;
  specRel: string;
  specAbs: string;
  skillsMd: string;
}

let tmpRoot: string;

function makeFixture(opts: { existingSkillsMd?: string } = {}): Fixture {
  const specDir = path.join(tmpRoot, 'docs', 'changes', 'feat');
  fs.mkdirSync(specDir, { recursive: true });
  const specAbs = path.join(specDir, 'proposal.md');
  fs.writeFileSync(specAbs, SPEC_BODY, 'utf-8');

  const skillsMd = path.join(specDir, 'SKILLS.md');
  if (opts.existingSkillsMd !== undefined) {
    fs.writeFileSync(skillsMd, opts.existingSkillsMd, 'utf-8');
  }

  return {
    cwd: tmpRoot,
    specRel: path.join('docs', 'changes', 'feat', 'proposal.md'),
    specAbs,
    skillsMd,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'advise-skills-guard-'));
  hoisted.extractSignalsMock.mockReturnValue({
    specKeywords: [],
    specText: '',
    stackSignals: [],
    featureDomain: [],
  });
  hoisted.loadOrRebuildIndexMock.mockReturnValue({ skills: { a: {}, b: {} } });
  hoisted.generateSkillsMdMock.mockReturnValue(GENERATED_MD);
  hoisted.resolveConfigMock.mockReturnValue({ ok: false });
  hoisted.matchContentMock.mockReturnValue(makeResult());
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('runAdviseSkills write guard (#1916 / CLI-R004)', () => {
  it('does NOT create SKILLS.md on disk under dryRun, but still returns the recommendations', async () => {
    const fx = makeFixture();

    const out = await runAdviseSkills({ specPath: fx.specRel, cwd: fx.cwd, dryRun: true });

    // The whole point of the bug: no file may appear next to the spec.
    expect(fs.existsSync(fx.skillsMd)).toBe(false);

    // A dry run is still a full advisory run — the query half must be intact.
    expect(out.result.matches.map((m) => m.skillName)).toEqual(['skill-a']);
    expect(out.featureName).toBe('Add Login Flow');
    // It must still report WHERE it would have written, so the user can act on it.
    expect(out.skillsMdPath).toBe(fx.skillsMd);
    expect(out.written).toBe(false);
  });

  it('leaves a pre-existing SKILLS.md byte-for-byte untouched under dryRun', async () => {
    const fx = makeFixture({ existingSkillsMd: HAND_EDITED });
    const before = fs.statSync(fx.skillsMd).mtimeMs;

    const out = await runAdviseSkills({ specPath: fx.specRel, cwd: fx.cwd, dryRun: true });

    expect(fs.readFileSync(fx.skillsMd, 'utf-8')).toBe(HAND_EDITED);
    expect(fs.statSync(fx.skillsMd).mtimeMs).toBe(before);
    expect(out.written).toBe(false);
    // The overwrite that WOULD have happened is surfaced rather than silent.
    expect(out.existed).toBe(true);
  });

  it('still writes SKILLS.md by default — the MCP twin and harness-planning depend on it', async () => {
    const fx = makeFixture();

    const out = await runAdviseSkills({ specPath: fx.specRel, cwd: fx.cwd });

    expect(fs.existsSync(fx.skillsMd)).toBe(true);
    expect(fs.readFileSync(fx.skillsMd, 'utf-8')).toBe(GENERATED_MD);
    expect(out.skillsMdPath).toBe(fx.skillsMd);
    expect(out.written).toBe(true);
    expect(out.existed).toBe(false);
  });

  it('reports an overwrite of an existing SKILLS.md instead of clobbering it silently', async () => {
    const fx = makeFixture({ existingSkillsMd: HAND_EDITED });

    const out = await runAdviseSkills({ specPath: fx.specRel, cwd: fx.cwd });

    expect(fs.readFileSync(fx.skillsMd, 'utf-8')).toBe(GENERATED_MD);
    expect(out.written).toBe(true);
    expect(out.existed).toBe(true);
  });
});

describe('advise-skills --dry-run flag (#1916 / CLI-R004)', () => {
  /** Absolute spec path so the command resolves it without depending on cwd. */
  async function runCli(args: string[]): Promise<void> {
    await createAdviseSkillsCommand().parseAsync(args, { from: 'user' });
  }

  it('exposes --dry-run, and it suppresses the write end-to-end through the command', async () => {
    const fx = makeFixture();

    await runCli(['--spec-path', fx.specAbs, '--dry-run']);

    expect(fs.existsSync(fx.skillsMd)).toBe(false);

    // The human output must still show recommendations AND name the path it skipped.
    const printed = hoisted.infoMock.mock.calls.map((c) => String(c[0])).join('\n');
    expect(printed).toContain('skill-a');
    expect(printed).toContain(fx.skillsMd);
    expect(printed.toLowerCase()).toContain('dry-run');
  });

  it('writes by default when --dry-run is absent', async () => {
    const fx = makeFixture();

    await runCli(['--spec-path', fx.specAbs]);

    expect(fs.existsSync(fx.skillsMd)).toBe(true);
    expect(fs.readFileSync(fx.skillsMd, 'utf-8')).toBe(GENERATED_MD);
  });

  it('names the write in its description, so the contract is visible in --help', () => {
    const description = createAdviseSkillsCommand().description();

    expect(description).toMatch(/SKILLS\.md/);
    expect(description).toMatch(/write|overwrite/i);
  });
});
