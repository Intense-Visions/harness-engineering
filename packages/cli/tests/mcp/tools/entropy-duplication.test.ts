// packages/cli/tests/mcp/tools/entropy-duplication.test.ts
//
// `detect_entropy type: "duplication"` through the REAL loader, the REAL
// EntropyAnalyzer and the REAL clone detector against a copied fixture — the
// `entropy-config-threading.test.ts` pattern, no mocks. The enum row is
// deliberately shallow; the behavioral rows below are the WIRED proof.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { handleDetectEntropy, detectEntropyDefinition } from '../../../src/mcp/tools/entropy';
import { wrapWithCompaction } from '../../../src/mcp/middleware/compaction';
import { ENTROPY_ISSUE_TYPES } from '../../../src/shared/duplication-request';

const FIXTURE = path.join(__dirname, '../../fixtures/duplication-cli-project');

let projectDir: string;

function writeEntropy(entropy: Record<string, unknown>): void {
  const configPath = path.join(projectDir, 'harness.config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  config.entropy = { ...config.entropy, ...entropy };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

async function detect(input: Parameters<typeof handleDetectEntropy>[0]) {
  const result = await handleDetectEntropy(input);
  return { result, payload: JSON.parse(result.content[0]!.text) };
}

describe('detect_entropy type: "duplication"', () => {
  beforeEach(() => {
    projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-dup-mcp-'));
    fs.cpSync(FIXTURE, projectDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(projectDir, { recursive: true, force: true });
  });

  it('advertises duplication in the type enum', () => {
    // MUTATION: remove the enum value and this fails. Shallow on purpose.
    expect(detectEntropyDefinition.inputSchema.properties.type.enum).toContain('duplication');
  });

  it('reports the fixture clone class — the MCP WIRED proof', async () => {
    const { result, payload } = await detect({ path: projectDir, type: 'duplication' });
    expect(result.isError).toBeUndefined();
    expect(payload.duplication.classes).toHaveLength(1);
    expect(payload.duplication.classes[0].members).toHaveLength(3);
    expect(payload.duplication.classes[0].tokenCount).toBe(83);
    expect(payload.duplication.stats.classesReported).toBe(1);
  });

  it('threads an entropy.duplication override into the detector', async () => {
    // MUTATION: drop the `duplication` spread from the analyzer config and the
    // override stops biting — the class comes back.
    writeEntropy({ duplication: { minInstances: 4 } });
    const { result, payload } = await detect({ path: projectDir, type: 'duplication' });
    expect(result.isError).toBeUndefined();
    expect(payload.duplication.classes).toHaveLength(0);
    expect(payload.duplication.stats.classesSuppressed).toBeGreaterThanOrEqual(1);
  });

  it('does not run duplication under type: "all" on an unconfigured project', async () => {
    const { payload } = await detect({ path: projectDir, type: 'all' });
    expect('duplication' in payload).toBe(false);
  });

  it('refuses an explicit request when entropy.duplication is false', async () => {
    writeEntropy({ duplication: false });
    const result = await handleDetectEntropy({ path: projectDir, type: 'duplication' });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('entropy.duplication');
  });

  it('omits byMember instead of shipping an unreadable {}', async () => {
    const { payload } = await detect({ path: projectDir, type: 'duplication' });
    // Measured BEFORE this change: duplication's keys were
    // ['classes','byMember','collisions','skipErrors','stats'] and
    // `byMember` serialized to `{}` — a key that reads as an empty index
    // rather than an unserializable Map (spec Phase 3 forward note 4).
    // MUTATION: return the raw report and `byMember` reappears.
    expect('byMember' in payload.duplication).toBe(false);
    expect(payload.duplication.classes[0].members).toHaveLength(3);
    // Nothing else was lost by the projection.
    expect(payload.duplication.stats.classesReported).toBe(1);
    expect(payload.duplication.collisions).toEqual([]);
    expect(payload.duplication.skipErrors).toEqual([]);
    expect(payload.snapshot).toBeDefined();
  });

  it('reports duplication in summary mode OUTSIDE totalIssues', async () => {
    const { payload } = await detect({ path: projectDir, type: 'duplication', mode: 'summary' });
    expect(payload.advisory.duplication.classesReported).toBe(1);
    expect(payload.advisory.duplication.membersReported).toBe(3);
    expect(payload.advisory.duplication.topClasses[0]).toContain('3x 83 tokens');
    // Summary mode was the one duplication surface with no skip counter, so a
    // PARTIAL scan read as a complete one. The Phase-3 fixture skips nothing,
    // so 0 is the right value here; a non-zero arm is covered by core's own
    // skip suites, since this surface only forwards the counter.
    expect(payload.advisory.duplication.filesSkipped).toBe(0);
    // The Phase-3 fixture's one class is a plain duplicate, so the summary
    // line must carry NO signal tag.
    expect(payload.advisory.duplication.topClasses[0]).not.toContain('partial-extraction');
    // MUTATION: fold duplication into `totalIssues` and this fails — the D4
    // parity test for the MCP surface. `totalIssues` is the one number an
    // agent reads as "is this clean".
    expect(payload.totalIssues).toBe(0);
  });

  // WIRE LEVEL. Every other row in this file calls `handleDetectEntropy`
  // directly — BELOW the compaction middleware every registered tool handler
  // is wrapped in (`mcp/middleware/compaction.ts:205`, applied in
  // `mcp/server.ts`). That is why the defect this row pins was invisible:
  // measured on this fixture before the key reorder, the DELIVERED text was
  // 16,261 bytes of pure AST, `JSON.parse` threw at position 15954, and
  // `"duplication"` (byte 50,409 of a 51,333-byte payload) never made it onto
  // the wire at all. Asserting through the wrapper is the only way to see what
  // a real MCP client receives.
  it('delivers a parseable payload WITH duplication through the compaction middleware', async () => {
    const wrapped = wrapWithCompaction(
      'detect_entropy',
      (input) => handleDetectEntropy(input as Parameters<typeof handleDetectEntropy>[0]),
      { projectRoot: projectDir }
    );
    const result = await wrapped({ path: projectDir, type: 'duplication' });
    const delivered = result.content[0]!.text;

    // The middleware prepends a `<!-- packed: ... -->` provenance header; the
    // JSON body is everything after it.
    expect(delivered).toMatch(/^<!-- packed: /);
    const body = delivered.slice(delivered.indexOf('\n') + 1);

    // MUTATION: keep `ast` on the snapshot files and the payload is 5x the
    // 4,000-token budget — this parse throws (measured: at position 15954).
    const payload = JSON.parse(body);
    expect(payload.duplication.stats.classesReported).toBe(1);
    expect(payload.summary).toBeDefined();
    // `analysisErrors` is `[]` on a clean run and the structural pass drops
    // empty arrays (`structural.ts:22`), so on the wire an empty error list and
    // an absent one look alike. Pinned as the wire truth, not endorsed: when
    // the detector DOES fail the entry is present and now arrives inside the
    // budget, which is the case that matters.
    expect('analysisErrors' in payload).toBe(false);

    // `classes` holds exactly one class here, and the structural pass
    // COLLAPSES single-element arrays to the bare element
    // (`core/src/compaction/strategies/structural.ts:28`, documented at `:58`)
    // — so on the wire `classes` is the class object, not an array of one.
    // Pinned deliberately: this is the shape a real client parses, and the
    // single-element case is the common one. See the note on
    // `summarizeDuplication`.
    expect(Array.isArray(payload.duplication.classes)).toBe(false);
    expect(payload.duplication.classes.members).toHaveLength(3);
    expect(payload.duplication.classes.tokenCount).toBe(83);

    expect(delivered).not.toContain('[truncated');
    expect('ast' in payload.snapshot.files[0]).toBe(false);
    expect(payload.snapshot.files[0].path).toBeDefined();
    expect(payload.snapshot.files[0].exports).toBeDefined();

    // KEY ORDER is the other half of the fix, and it is NOT redundant with the
    // AST strip: 5 fixture files fit the budget without their ASTs, but a real
    // project's snapshot does not (this package's own snapshot is ~2,100
    // files), and truncation cuts by PREFIX. Asserted directly on the
    // delivered bytes because on this fixture nothing is truncated, so order
    // has no observable effect here — only on the payload that needs it.
    // MUTATION: put `snapshot` back first in `toJsonSafeReport` (its
    // declaration order in `EntropyReport`) and these three fail.
    expect(body.indexOf('"summary"')).toBeLessThan(body.indexOf('"snapshot"'));
    expect(body.indexOf('"duplication"')).toBeLessThan(body.indexOf('"snapshot"'));
    expect(body.indexOf('"summary"')).toBeLessThan(body.indexOf('"duplication"'));
  });

  it('omits the advisory block in summary mode when duplication did not run', async () => {
    const { payload } = await detect({ path: projectDir, type: 'dead-code', mode: 'summary' });
    expect(payload.advisory).toBeUndefined();
  });

  // CONFIG-FAILURE PARITY with `harness cleanup`. Measured on identical input
  // (`entropy.duplication: { minInstances: 1 }` — the exact mistake the new
  // bound exists to catch) before this fix: the CLI printed
  // `x Invalid config: - entropy.duplication.minInstances: Number must be
  // greater than or equal to 2` and exited 2, while this tool returned
  // classesReported: 1 with no error and no warning, having discarded the
  // whole `entropy` block including the fixture's entryPoints and
  // excludePatterns. Two surfaces, one config, opposite failure policies.
  it('refuses an invalid config instead of silently scanning on defaults', async () => {
    writeEntropy({ duplication: { minInstances: 1 } });
    const result = await handleDetectEntropy({ path: projectDir, type: 'duplication' });
    // MUTATION: restore `if (!loaded.ok) return undefined` in
    // `loadEntropyConfig` and this row fails three ways at once.
    expect(result.isError).toBe(true);
    const text = result.content[0]!.text;
    expect(text).toContain('Invalid config');
    expect(text).toContain('entropy.duplication.minInstances');
    expect(text).toContain('Refusing to analyze on built-in defaults');
    // The refusal must not also leak a scan result.
    expect(text).not.toContain('classesReported');
  });

  it('still analyzes a project with no harness.config.json at all', async () => {
    // `none` is NOT `invalid`: no config is a legitimate reason to use the
    // built-in defaults, and the refusal above must not swallow it.
    fs.rmSync(path.join(projectDir, 'harness.config.json'));
    const { result, payload } = await detect({ path: projectDir, type: 'duplication' });
    expect(result.isError).toBeUndefined();
    expect(payload.duplication.stats.classesReported).toBe(1);
  });

  // The phase's one named MCP safety guard (spec Phase 3 forward note 3), and
  // until this row it had ZERO coverage: deleting the whole did-not-run branch
  // from `handleDetectEntropy` left the suite green, because the fixture has
  // no `.harness/graph` so `snapshot-bypassed` never fired. On any
  // graph-bearing project it is the ONLY outcome this surface can produce —
  // `loadEntropyGraphOptions` supplies both graph keys unconditionally, which
  // makes `EntropyAnalyzer` bypass the snapshot, and duplication discovers
  // through `snapshot.files` — so the untested branch is the one that fires in
  // essentially every real invocation. Its CLI twin was already tested.
  //
  // `saveGraph([], [])` is the whole fixture: `loadGraphStore` only needs
  // `metadata.json` + `graph.json` at the current schema version to hand back
  // a store, and the adapter is content with an empty one. Written through the
  // real serializer rather than hand-rolled JSON so a schema bump cannot make
  // this row silently stop firing.
  it('names the did-not-run reason on a graph-bearing project', async () => {
    const { saveGraph } = await import('@harness-engineering/graph');
    await saveGraph(path.join(projectDir, '.harness', 'graph'), [], []);

    const result = await handleDetectEntropy({ path: projectDir, type: 'duplication' });
    // MUTATION: delete the did-not-run branch and this returns a report with
    // `duplication` absent and isError unset — "did not run" rendering as
    // "no duplication found", which is the opposite of the truth.
    expect(result.isError).toBe(true);
    const text = result.content[0]!.text;
    expect(text).toContain('Duplication analysis did not run');
    expect(text).toContain('no codebase snapshot was built');
    // The analyzer's own suggestions, not a paraphrase.
    expect(text).toContain('Supply graph data for at most one of drift / deadCode');
    expect(text).not.toContain('classesReported');
  });

  // The JSON-schema `enum` is DECORATIVE — the MCP SDK does not enforce it.
  // Measured before this guard: `{ type: "duplicaiton", mode: "summary" }`
  // returned `{"mode":"summary","totalIssues":0}` with no error, and the only
  // weak marker (`categories: {}`) is deleted by structural compaction, making
  // the wire response byte-indistinguishable from a clean full scan.
  it('refuses an unknown type instead of reporting zero issues', async () => {
    const result = await handleDetectEntropy({
      path: projectDir,
      type: 'duplicaiton',
      mode: 'summary',
    });
    // MUTATION: drop the `isEntropyIssueType` guard and this comes back
    // `{"mode":"summary","totalIssues":0}` with isError unset.
    expect(result.isError).toBe(true);
    const text = result.content[0]!.text;
    expect(text).toContain('Unknown issue type "duplicaiton"');
    expect(text).toContain('drift, dead-code, patterns, duplication, all');
    expect(text).not.toContain('totalIssues');
  });

  it('advertises the same type list the CLI accepts', () => {
    // One shared list; a drift between the two surfaces fails here.
    expect(detectEntropyDefinition.inputSchema.properties.type.enum).toEqual([
      ...ENTROPY_ISSUE_TYPES,
    ]);
  });

  it('still refuses patterns with no rules configured (no regression)', async () => {
    const result = await handleDetectEntropy({ path: projectDir, type: 'patterns' });
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('No pattern rules are configured');
  });
});
