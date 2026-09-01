import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { handleDetectEntropy } from '../../../src/mcp/tools/entropy';

// Regression for issue #1792: the MCP entropy tool used to pass `patterns` as a
// bare boolean, which the EntropyAnalyzer coerces into an empty rule set
// (`{ patterns: [] }`). That evaluated ZERO pattern rules yet reported zero
// violations — a pass indistinguishable from a real check that found nothing —
// the same empty-ruleset false-pass fixed on the CLI path in #1760 (PR #1791).
//
// This exercises the REAL config loader + analyzer + pattern detector (no mocks)
// so it proves the tool actually threads configured rules through and refuses to
// green-tick zero rules.
let projectDir: string;

function writeConfig(config: Record<string, unknown>): void {
  fs.writeFileSync(
    path.join(projectDir, 'harness.config.json'),
    JSON.stringify({ version: 1, rootDir: '.', ...config }, null, 2)
  );
}

// A source file that exports `banned` — a rule forbidding that export must fire.
function writeSource(): void {
  fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(projectDir, 'src', 'example.ts'),
    'export const banned = 1;\nexport const allowed = 2;\n'
  );
}

// A declarative pattern rule that the source file above violates.
const bannedExportRule = {
  name: 'no-banned-export',
  description: 'The `banned` symbol must not be exported',
  severity: 'error' as const,
  files: ['src/**/*.ts'],
  rule: { type: 'no-export' as const, names: ['banned'] },
};

describe('detect_entropy — patterns empty-ruleset false-pass (issue #1792)', () => {
  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-entropy-patterns-'));
    writeSource();
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  // Fail-before: bare boolean → empty rule set → "no violations", isError
  // undefined (a false pass). Pass-after: refuses to report a pass over zero
  // rules.
  it('fails loudly when type=patterns has no configured rules', async () => {
    writeConfig({ entropy: { entryPoints: ['src/example.ts'] } });
    const result = await handleDetectEntropy({ path: projectDir, type: 'patterns' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/no pattern rules/i);
  });

  // Fail-before: bare boolean → empty rule set → the configured rule is never
  // evaluated, so the real violation is missed and the tool reports clean.
  // Pass-after: the configured rule is threaded through and the violation is
  // reported.
  it('evaluates configured pattern rules and reports real violations', async () => {
    writeConfig({
      entropy: { entryPoints: ['src/example.ts'], patterns: { patterns: [bannedExportRule] } },
    });
    const result = await handleDetectEntropy({ path: projectDir, type: 'patterns' });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    const violations: Array<{ pattern: string }> = data.patterns?.violations ?? [];
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.pattern === 'no-banned-export')).toBe(true);
  });

  // The common no-config path (`type=all`) must NOT start failing: patterns are
  // simply skipped when unconfigured, while drift/dead-code still run.
  it('skips patterns (no error) for type=all when no rules are configured', async () => {
    writeConfig({ entropy: { entryPoints: ['src/example.ts'] } });
    const result = await handleDetectEntropy({ path: projectDir, type: 'all' });
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    // No pattern report is produced when patterns is skipped, so there are no
    // pattern violations green-ticked from an empty rule set.
    const violations: Array<unknown> = data.patterns?.violations ?? [];
    expect(violations).toHaveLength(0);
  });
});
