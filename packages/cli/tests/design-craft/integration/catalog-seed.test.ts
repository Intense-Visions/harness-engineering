// packages/cli/tests/design-craft/integration/catalog-seed.test.ts
//
// Phase 2 catalog increment guard tests.
//
// Coverage:
//   1. SEED_PATTERNS exposes the three Phase 2 patterns in code order
//      (CRAFT-P001, P002, P003) with the right tier x impact pairs
//      asserted from the proposal:
//         spring-physics      polish x medium
//         skeleton-content    polish x large
//         stagger-timing      polish x small
//      This locks the catalog's tier-vs-impact independence — adding a
//      new pattern that conflates the two would surface here.
//   2. SEED_EXEMPLARS exposes the three Phase 2 exemplars across three
//      component types (EmptyState, LoadingState, CommandPalette) so
//      BENCHMARK fans out across more than one type from v1.
//   3. Every entry carries the ADR 0020 provenance fields (id, version,
//      status, authoredAt, contributors[], source.ref).
//   4. End-to-end: a fixture that matches the skeleton pattern's
//      applicableTo filter routes through the POLISH phase and emits a
//      CRAFT-P002 finding when the LLM returns applies: true. Proves the
//      new pattern is genuinely wired, not just imported.

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SEED_PATTERNS } from '../../../src/design-craft/catalog/patterns/index.js';
import { SEED_EXEMPLARS } from '../../../src/design-craft/catalog/exemplars/index.js';
import { MockLlmProvider } from '../../../src/design-craft/llm/provider.js';
import { handleDesignCraft } from '../../../src/mcp/tools/design-craft.js';

describe('design-craft Phase 2 catalog seed — patterns', () => {
  it('SEED_PATTERNS contains the three Phase 2 patterns in stable order', () => {
    const ids = SEED_PATTERNS.map((p) => p.id);
    expect(ids).toEqual([
      'pattern-spring-physics',
      'pattern-skeleton-content-matched',
      'pattern-stagger-timing',
    ]);
  });

  it('each pattern declares the tier x impact pair from the proposal', () => {
    const byId = new Map(SEED_PATTERNS.map((p) => [p.id, p]));
    expect(byId.get('pattern-spring-physics')?.findingTemplate).toMatchObject({
      code: 'CRAFT-P001',
      tier: 'polish',
      impact: 'medium',
      phase: 'polish',
    });
    expect(byId.get('pattern-skeleton-content-matched')?.findingTemplate).toMatchObject({
      code: 'CRAFT-P002',
      tier: 'polish',
      impact: 'large',
      phase: 'polish',
    });
    expect(byId.get('pattern-stagger-timing')?.findingTemplate).toMatchObject({
      code: 'CRAFT-P003',
      tier: 'polish',
      impact: 'small',
      phase: 'polish',
    });
  });

  it('every pattern carries the ADR 0020 provenance fields', () => {
    for (const p of SEED_PATTERNS) {
      expect(p.id).toMatch(/^pattern-[a-z0-9-]+$/);
      expect(p.version).toBeGreaterThan(0);
      expect(['stable', 'draft', 'deprecated']).toContain(p.status);
      expect(p.authoredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(p.contributors.length).toBeGreaterThan(0);
      expect(p.source.ref).toBeTruthy();
      expect(p.applicableTo.length).toBeGreaterThan(0);
      expect(p.before.length).toBeGreaterThan(0);
      expect(p.after.length).toBeGreaterThan(0);
    }
  });
});

describe('design-craft Phase 2 catalog seed — exemplars', () => {
  it('SEED_EXEMPLARS spans three component types', () => {
    const types = SEED_EXEMPLARS.map((e) => e.componentType);
    expect(types).toEqual(['EmptyState', 'LoadingState', 'CommandPalette']);
  });

  it('every exemplar carries the ADR 0020 provenance fields and a complete radarReference', () => {
    for (const e of SEED_EXEMPLARS) {
      expect(e.id).toMatch(/^exemplar-[a-z0-9-]+$/);
      expect(e.version).toBeGreaterThan(0);
      expect(['stable', 'draft', 'deprecated']).toContain(e.status);
      expect(e.authoredAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(e.contributors.length).toBeGreaterThan(0);
      expect(e.source.ref).toBeTruthy();
      // Radar scores live in [0, 100] independently per dimension.
      for (const dim of [
        e.radarReference.philosophicalCoherence,
        e.radarReference.hierarchy,
        e.radarReference.craftExecution,
        e.radarReference.function,
        e.radarReference.innovation,
      ]) {
        expect(dim).toBeGreaterThanOrEqual(0);
        expect(dim).toBeLessThanOrEqual(100);
      }
      expect(e.citationCount).toBe(0);
    }
  });
});

const SKELETON_SOURCE = `
// Fixture: an inbox that loads with a generic Spinner.
export function Inbox() {
  if (isLoading) return <Spinner />;
  return <List items={data} />;
}
`;

const SKELETON_APPLIES_RESPONSE = [
  '```json',
  JSON.stringify(
    {
      applies: true,
      tier: 'polish',
      impact: 'large',
      confidence: 'high',
      message:
        'Spinner gives no preview of the about-to-appear list — replace with a content-matched skeleton.',
    },
    null,
    2
  ),
  '```',
].join('\n');

describe('design-craft skeleton pattern wired end-to-end', () => {
  it('emits a CRAFT-P002 finding when the LLM judges the pattern applies', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'design-craft-skeleton-'));
    const fixturePath = path.join(tmpDir, 'Inbox.tsx');
    fs.writeFileSync(fixturePath, SKELETON_SOURCE, 'utf8');

    const provider = new MockLlmProvider([
      // The skeleton-content-matched pattern's prompt references the target
      // identifier "Inbox" derived from the file's basename.
      { promptIncludes: 'Inbox', response: SKELETON_APPLIES_RESPONSE },
    ]);

    const result = await handleDesignCraft({
      path: tmpDir,
      mode: 'fast',
      phases: ['polish'],
      files: [fixturePath],
      autoCapture: 'skip',
      __testProvider: provider,
      __recordMeasurement: false,
    });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(result.content[0].text) as {
      findings: Array<{ code: string; tier: string; impact: string; before?: string }>;
    };
    const p002 = payload.findings.find((f) => f.code === 'CRAFT-P002');
    expect(p002).toBeTruthy();
    expect(p002?.tier).toBe('polish');
    expect(p002?.impact).toBe('large');
    expect(p002?.before).toContain('Spinner');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
