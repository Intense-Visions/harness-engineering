import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import { runAdviseSkills } from './advise-skills';
import type { ContentMatchResult, SkillMatch } from '../skill/content-matcher-types';

/**
 * Unit contract for the `advise-skills` CLI command orchestration
 * (`runAdviseSkills`).
 *
 * Pins the CURRENT observable behavior of the command's glue logic:
 *  - reads the spec text (and throws a precise error when the spec is missing);
 *  - reads project deps/devDeps from package.json and feeds them to
 *    `extractSignals` (defaulting to empty maps when package.json is
 *    absent/invalid);
 *  - resolves config and forwards `skills.tierOverrides` to
 *    `loadOrRebuildIndex`;
 *  - filters matches by tier (apply -> top, reference -> top*2, consider only
 *    when `thorough`, sliced to top);
 *  - derives the feature name from the spec's `# Title` (falling back to the
 *    spec directory basename);
 *  - writes the generated markdown to a sibling `SKILLS.md`.
 *
 * Fully hermetic: `node:fs` and every collaborating module
 * (index-builder, signal-extractor, content-matcher, skills-md-writer, config
 * loader, logger) are mocked, so there is no real filesystem access, no
 * subprocess, no network, and no wall-clock or ordering dependence.
 */

const hoisted = vi.hoisted(() => ({
  existsSyncMock: vi.fn(),
  readFileSyncMock: vi.fn(),
  writeFileSyncMock: vi.fn(),
  extractSignalsMock: vi.fn(),
  matchContentMock: vi.fn(),
  loadOrRebuildIndexMock: vi.fn(),
  generateSkillsMdMock: vi.fn(),
  resolveConfigMock: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: hoisted.existsSyncMock,
      readFileSync: hoisted.readFileSyncMock,
      writeFileSync: hoisted.writeFileSyncMock,
    },
    existsSync: hoisted.existsSyncMock,
    readFileSync: hoisted.readFileSyncMock,
    writeFileSync: hoisted.writeFileSyncMock,
  };
});

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
  logger: { info: vi.fn(), error: vi.fn() },
}));

const CWD = '/proj';
const SPEC_REL = 'docs/proposal.md';
const SPEC_ABS = path.resolve(CWD, SPEC_REL); // /proj/docs/proposal.md
const PKG_ABS = path.join(CWD, 'package.json'); // /proj/package.json
const SKILLS_MD_ABS = path.join(path.dirname(SPEC_ABS), 'SKILLS.md'); // /proj/docs/SKILLS.md

const SPEC_WITH_TITLE = '# Add Login Flow\n\nBuild a secure authentication feature.';
const PKG_JSON = JSON.stringify({
  dependencies: { react: '18.0.0' },
  devDependencies: { vitest: '1.0.0' },
});

const SENTINEL_SIGNALS = {
  specKeywords: ['auth'],
  specText: '',
  stackSignals: [],
  featureDomain: [],
};
const SENTINEL_INDEX = { skills: { a: {}, b: {}, c: {} } };
const GENERATED_MD = '# SKILLS.md content\n';

function makeMatch(tier: SkillMatch['tier'], name: string, score: number): SkillMatch {
  return {
    skillName: name,
    score,
    tier,
    matchReasons: ['reason'],
    category: 'design',
    when: 'during build',
  };
}

function makeResult(matches: SkillMatch[]): ContentMatchResult {
  return {
    matches,
    signalsUsed: SENTINEL_SIGNALS,
    scanDuration: 12,
  };
}

/** Route fs reads by path so both the spec and package.json resolve. */
function wireFilesystem(opts: { specText?: string; pkgExists?: boolean; pkgText?: string } = {}) {
  const specText = opts.specText ?? SPEC_WITH_TITLE;
  const pkgExists = opts.pkgExists ?? true;
  const pkgText = opts.pkgText ?? PKG_JSON;

  hoisted.existsSyncMock.mockImplementation((p: string) => {
    if (p === SPEC_ABS) return true;
    if (p === PKG_ABS) return pkgExists;
    return false;
  });
  hoisted.readFileSyncMock.mockImplementation((p: string) => {
    if (p === SPEC_ABS) return specText;
    if (p === PKG_ABS) return pkgText;
    throw new Error(`unexpected read: ${p}`);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  wireFilesystem();
  hoisted.extractSignalsMock.mockReturnValue(SENTINEL_SIGNALS);
  hoisted.loadOrRebuildIndexMock.mockReturnValue(SENTINEL_INDEX);
  hoisted.generateSkillsMdMock.mockReturnValue(GENERATED_MD);
  hoisted.resolveConfigMock.mockReturnValue({ ok: false });
  hoisted.matchContentMock.mockReturnValue(makeResult([makeMatch('apply', 'skill-a', 0.9)]));
});

describe('runAdviseSkills', () => {
  it('reads the spec, matches skills, and writes the generated markdown to a sibling SKILLS.md', async () => {
    const out = await runAdviseSkills({ specPath: SPEC_REL, cwd: CWD });

    // Spec and package.json were read from the resolved absolute paths.
    expect(hoisted.readFileSyncMock).toHaveBeenCalledWith(SPEC_ABS, 'utf-8');

    // Deps parsed from package.json are forwarded to signal extraction.
    expect(hoisted.extractSignalsMock).toHaveBeenCalledWith(
      SPEC_WITH_TITLE,
      { react: '18.0.0' },
      { vitest: '1.0.0' }
    );

    // Signals flow into matching.
    expect(hoisted.matchContentMock).toHaveBeenCalledWith(SENTINEL_INDEX, SENTINEL_SIGNALS);

    // Markdown is generated and written next to the spec.
    expect(hoisted.generateSkillsMdMock).toHaveBeenCalledWith(
      'Add Login Flow',
      expect.objectContaining({ matches: expect.any(Array) }),
      Object.keys(SENTINEL_INDEX.skills).length
    );
    expect(hoisted.writeFileSyncMock).toHaveBeenCalledWith(SKILLS_MD_ABS, GENERATED_MD, 'utf-8');

    // Return shape reflects the resolved artifacts.
    expect(out.skillsMdPath).toBe(SKILLS_MD_ABS);
    expect(out.featureName).toBe('Add Login Flow');
    expect(out.totalSkills).toBe(Object.keys(SENTINEL_INDEX.skills).length);
  });

  it('throws a precise error when the spec file does not exist', async () => {
    hoisted.existsSyncMock.mockImplementation((p: string) => p === PKG_ABS);

    await expect(runAdviseSkills({ specPath: SPEC_REL, cwd: CWD })).rejects.toThrow(
      `Spec not found: ${SPEC_ABS}`
    );
    expect(hoisted.writeFileSyncMock).not.toHaveBeenCalled();
  });

  it('passes empty dep maps to extractSignals when package.json is absent', async () => {
    wireFilesystem({ pkgExists: false });

    await runAdviseSkills({ specPath: SPEC_REL, cwd: CWD });

    expect(hoisted.extractSignalsMock).toHaveBeenCalledWith(SPEC_WITH_TITLE, {}, {});
  });

  it('passes empty dep maps to extractSignals when package.json is invalid JSON', async () => {
    wireFilesystem({ pkgText: '{ not valid json' });

    await runAdviseSkills({ specPath: SPEC_REL, cwd: CWD });

    expect(hoisted.extractSignalsMock).toHaveBeenCalledWith(SPEC_WITH_TITLE, {}, {});
  });

  it('forwards config skills.tierOverrides to the index builder when config resolves', async () => {
    const tierOverrides = { 'skill-a': 'apply' };
    hoisted.resolveConfigMock.mockReturnValue({
      ok: true,
      value: { skills: { tierOverrides } },
    });

    await runAdviseSkills({ specPath: SPEC_REL, cwd: CWD });

    expect(hoisted.loadOrRebuildIndexMock).toHaveBeenCalledWith('claude-code', CWD, tierOverrides);
  });

  it('passes undefined tierOverrides to the index builder when config does not resolve', async () => {
    hoisted.resolveConfigMock.mockReturnValue({ ok: false });

    await runAdviseSkills({ specPath: SPEC_REL, cwd: CWD });

    expect(hoisted.loadOrRebuildIndexMock).toHaveBeenCalledWith('claude-code', CWD, undefined);
  });

  it('falls back to the spec directory basename when the spec has no title heading', async () => {
    wireFilesystem({ specText: 'no heading here, just body text' });

    const out = await runAdviseSkills({ specPath: SPEC_REL, cwd: CWD });

    // dirname(/proj/docs/proposal.md) basename === 'docs'
    expect(out.featureName).toBe('docs');
    expect(hoisted.generateSkillsMdMock).toHaveBeenCalledWith(
      'docs',
      expect.anything(),
      expect.anything()
    );
  });
});

describe('runAdviseSkills tier filtering', () => {
  const TOP = 2;

  function wireManyMatches() {
    hoisted.matchContentMock.mockReturnValue(
      makeResult([
        makeMatch('apply', 'apply-1', 0.95),
        makeMatch('apply', 'apply-2', 0.9),
        makeMatch('apply', 'apply-3', 0.85), // beyond top -> dropped
        makeMatch('reference', 'ref-1', 0.5),
        makeMatch('reference', 'ref-2', 0.48),
        makeMatch('reference', 'ref-3', 0.46),
        makeMatch('reference', 'ref-4', 0.44),
        makeMatch('reference', 'ref-5', 0.42), // beyond top*2 -> dropped
        makeMatch('consider', 'consider-1', 0.2),
        makeMatch('consider', 'consider-2', 0.18),
        makeMatch('consider', 'consider-3', 0.16), // beyond top -> dropped when thorough
      ])
    );
  }

  it('caps apply to top and reference to top*2, and excludes consider when not thorough', async () => {
    wireManyMatches();

    await runAdviseSkills({ specPath: SPEC_REL, cwd: CWD, top: TOP, thorough: false });

    const filtered = hoisted.generateSkillsMdMock.mock.calls[0]![1] as ContentMatchResult;
    const names = filtered.matches.map((m) => m.skillName);

    expect(names.filter((n) => n.startsWith('apply-'))).toEqual(['apply-1', 'apply-2']);
    expect(names.filter((n) => n.startsWith('ref-'))).toEqual(['ref-1', 'ref-2', 'ref-3', 'ref-4']);
    expect(names.filter((n) => n.startsWith('consider-'))).toEqual([]);
  });

  it('includes consider tier capped to top when thorough is set', async () => {
    wireManyMatches();

    await runAdviseSkills({ specPath: SPEC_REL, cwd: CWD, top: TOP, thorough: true });

    const filtered = hoisted.generateSkillsMdMock.mock.calls[0]![1] as ContentMatchResult;
    const considerNames = filtered.matches
      .map((m) => m.skillName)
      .filter((n) => n.startsWith('consider-'));

    expect(considerNames).toEqual(['consider-1', 'consider-2']);
  });
});
