import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GraphStore } from '../../src/store/GraphStore.js';
import { BusinessKnowledgeIngestor } from '../../src/ingest/BusinessKnowledgeIngestor.js';

// Regression for #2369: the frontmatter parsers read one physical line at a
// time, so a list whose value continues past the `key:` line — which is what
// prettier produces once a `tags: [...]` list exceeds the print width — was
// dropped silently. The node was still ingested, just without its tags.

// Verbatim frontmatter of docs/knowledge/cli/doctor-hardening.md (origin/main
// e962da1cc), i.e. the exact shape prettier writes.
const DOCTOR_HARDENING = `---
type: business_process
domain: cli
tags:
  [
    doctor,
    hardening,
    live-pings,
    hook-validity,
    baseline-freshness,
    session-corruption,
    hermes-phase-3,
  ]
phase: hermes-phase-3
status: shipped
---

# Doctor Hardening

Body.
`;

// Verbatim frontmatter of docs/knowledge/orchestrator/gateway-api.md.
const GATEWAY_API = `---
type: business_process
domain: orchestrator
tags:
  [
    gateway,
    auth,
    tokens,
    scopes,
    audit,
    bearer,
    api,
    versioning,
    sse,
    bridge-primitives,
    webhooks,
    hmac,
  ]
phase: hermes-phase-0-phase-3
status: in-progress
---

# Gateway API

Body.
`;

describe('BusinessKnowledgeIngestor — lists spanning several lines (#2369)', () => {
  let store: GraphStore;
  let ingestor: BusinessKnowledgeIngestor;
  let tmpDir: string;

  beforeEach(async () => {
    store = new GraphStore();
    ingestor = new BusinessKnowledgeIngestor(store);
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bk-wrapped-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function write(rel: string, content: string) {
    const full = path.join(tmpDir, rel);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, 'utf-8');
  }

  describe('ingest (docs/knowledge)', () => {
    it('keeps a prettier-wrapped tags list (doctor-hardening.md shape)', async () => {
      await write('cli/doctor-hardening.md', DOCTOR_HARDENING);
      const result = await ingestor.ingest(tmpDir);
      expect(result.errors).toEqual([]);
      const node = store.getNode('bk:cli:doctor-hardening');
      expect(node).not.toBeNull();
      expect(node!.metadata.tags).toEqual([
        'doctor',
        'hardening',
        'live-pings',
        'hook-validity',
        'baseline-freshness',
        'session-corruption',
        'hermes-phase-3',
      ]);
    });

    it('keeps a prettier-wrapped tags list (gateway-api.md shape)', async () => {
      await write('orchestrator/gateway-api.md', GATEWAY_API);
      await ingestor.ingest(tmpDir);
      const node = store.getNode('bk:orchestrator:gateway-api');
      expect(node).not.toBeNull();
      expect(node!.metadata.tags).toHaveLength(12);
      expect(node!.metadata.tags).toContain('bridge-primitives');
      expect(node!.metadata.tags).toContain('hmac');
    });

    it('keeps a flow list that opens on the key line and wraps', async () => {
      await write(
        'arch/inline-open.md',
        `---
type: business_rule
domain: arch
tags: [alpha, beta,
  gamma]
related: [x]
---

# Inline Open
`
      );
      await ingestor.ingest(tmpDir);
      const node = store.getNode('bk:arch:inline-open');
      expect(node!.metadata.tags).toEqual(['alpha', 'beta', 'gamma']);
      // The key after the wrapped list is still read.
      expect(node!.metadata.related).toEqual(['x']);
    });

    it('keeps a block-sequence list', async () => {
      await write(
        'arch/block.md',
        `---
type: business_rule
domain: arch
tags:
  - alpha
  - beta
source: manual
---

# Block
`
      );
      await ingestor.ingest(tmpDir);
      const node = store.getNode('bk:arch:block');
      expect(node!.metadata.tags).toEqual(['alpha', 'beta']);
      expect(node!.metadata.source).toBe('manual');
    });

    it('leaves single-line lists exactly as before', async () => {
      await write(
        'arch/single.md',
        `---
type: business_rule
domain: arch
tags: [layers, imports]
---

# Single
`
      );
      await ingestor.ingest(tmpDir);
      expect(store.getNode('bk:arch:single')!.metadata.tags).toEqual(['layers', 'imports']);
    });
  });

  describe('ingestSolutions (docs/solutions)', () => {
    const base = `module: cli
problem_type: pattern
last_updated: '2026-06-24'
track: knowledge-track
category: architecture-patterns`;

    it('accepts a prettier-wrapped tags list', async () => {
      await write(
        'knowledge-track/architecture-patterns/wrapped.md',
        `---
${base}
tags:
  [shared-rule, dual-backend, translation-layer, field-preservation, tracker-sync, promote, roadmap]
---

# Wrapped
`
      );
      const result = await ingestor.ingestSolutions(tmpDir);
      expect(result.errors).toEqual([]);
      const node = store.findNodes({}).find((n) => n.path?.includes('wrapped.md'));
      expect(node?.metadata.tags).toEqual([
        'shared-rule',
        'dual-backend',
        'translation-layer',
        'field-preservation',
        'tracker-sync',
        'promote',
        'roadmap',
      ]);
    });

    it('accepts a block-sequence tags list (required field, so the doc was rejected)', async () => {
      await write(
        'knowledge-track/architecture-patterns/block.md',
        `---
${base}
tags:
  - calibration-constants
  - 'math-naming'
---

# Block
`
      );
      const result = await ingestor.ingestSolutions(tmpDir);
      expect(result.errors).toEqual([]);
      const node = store.findNodes({}).find((n) => n.path?.includes('block.md'));
      expect(node?.metadata.tags).toEqual(['calibration-constants', 'math-naming']);
    });
  });
});
