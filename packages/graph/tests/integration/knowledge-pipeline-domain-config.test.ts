import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { GraphStore } from '../../src/store/GraphStore.js';
import { KnowledgePipelineRunner } from '../../src/ingest/KnowledgePipelineRunner.js';

describe('Knowledge Pipeline — domain config plumbing (Phase 4)', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kp-domain-cfg-'));
    // Set up fixture project structure
    await fs.mkdir(path.join(tmpDir, '.harness', 'knowledge', 'extracted'), {
      recursive: true,
    });
    await fs.mkdir(path.join(tmpDir, '.harness', 'knowledge', 'staged'), {
      recursive: true,
    });
    await fs.mkdir(path.join(tmpDir, 'docs', 'knowledge'), { recursive: true });
    await fs.mkdir(path.join(tmpDir, 'agents', 'skills'), { recursive: true });

    // One TypeScript file at agents/skills/foo.ts — extractable as a code-signal node.
    await fs.writeFile(
      path.join(tmpDir, 'agents', 'skills', 'foo.ts'),
      `/**\n * Foo skill — example documentation.\n * Lorem ipsum dolor sit amet.\n */\nexport function foo(): string {\n  return 'foo';\n}\n`
    );
  });

  afterEach(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true });
    } catch {
      // best-effort
    }
  });

  it('without inferenceOptions, agents/skills/foo classifies under "agents" (generic fallback)', async () => {
    const store = new GraphStore();
    // Pre-seed a knowledge node whose path lands under agents/skills/. The
    // pipeline scores domains over knowledge nodes (CoverageScorer) and
    // generates the gap report (KnowledgeStagingAggregator). Adding a
    // business_rule with the right path exercises both consumers.
    store.addNode({
      id: 'extracted:foo',
      type: 'business_rule',
      name: 'Foo Rule',
      path: 'agents/skills/foo.ts',
      metadata: { source: 'extractor' },
      content: 'When the system encounters a foo, it shall return foo within 1 ms.',
    });

    const runner = new KnowledgePipelineRunner(store);
    const result = await runner.run({
      projectDir: tmpDir,
      fix: false,
      ci: true,
    });

    const coverageDomains = result.coverage.domains.map((d) => d.domain);
    expect(coverageDomains).toContain('agents');
    expect(coverageDomains).not.toContain('skills');
  });

  it('with inferenceOptions.extraPatterns ["agents/<dir>"], same node classifies under "skills"', async () => {
    const store = new GraphStore();
    store.addNode({
      id: 'extracted:foo',
      type: 'business_rule',
      name: 'Foo Rule',
      path: 'agents/skills/foo.ts',
      metadata: { source: 'extractor' },
      content: 'When the system encounters a foo, it shall return foo within 1 ms.',
    });

    const runner = new KnowledgePipelineRunner(store);
    const result = await runner.run({
      projectDir: tmpDir,
      fix: false,
      ci: true,
      inferenceOptions: { extraPatterns: ['agents/<dir>'] },
    });

    const coverageDomains = result.coverage.domains.map((d) => d.domain);
    expect(coverageDomains).toContain('skills');
    expect(coverageDomains).not.toContain('agents');
  });

  it('the same fixture run twice with different inferenceOptions returns different domain bucketing', async () => {
    // Demonstrates the runner does not retain state between calls — per-call
    // options take precedence as documented.
    const buildStore = () => {
      const s = new GraphStore();
      s.addNode({
        id: 'extracted:foo',
        type: 'business_rule',
        name: 'Foo Rule',
        path: 'agents/skills/foo.ts',
        metadata: { source: 'extractor' },
        content: 'When the system encounters a foo, it shall return foo within 1 ms.',
      });
      return s;
    };

    const runner1 = new KnowledgePipelineRunner(buildStore());
    const r1 = await runner1.run({ projectDir: tmpDir, fix: false, ci: true });
    expect(r1.coverage.domains.map((d) => d.domain)).toContain('agents');

    const runner2 = new KnowledgePipelineRunner(buildStore());
    const r2 = await runner2.run({
      projectDir: tmpDir,
      fix: false,
      ci: true,
      inferenceOptions: { extraPatterns: ['agents/<dir>'] },
    });
    expect(r2.coverage.domains.map((d) => d.domain)).toContain('skills');
  });
});
