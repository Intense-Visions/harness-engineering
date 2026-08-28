---
schemaVersion: 1
module: 'packages/graph/src/constraints'
sourceHash: 'ee4209b688522e6328d52bef390a36bf4ef875951f8aa3b0b05df86c5d65db17'
compiledAt: '2026-08-28T01:22:11.583Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['DesignConstraintAdapter.ts', 'GraphConstraintAdapter.ts']
---

## Summary

`packages/graph/src/constraints` provides two adapters that bridge design/architecture rules with the knowledge graph:

**DesignConstraintAdapter** validates design token usage (hardcoded colors, fonts) against tokens stored in the graph and records externally-computed craft findings (from audit-component-anatomy, design-craft skills) as graph state. It creates `design_constraint` nodes (keyed by finding code) and `violates_design` edges from source files. Findings are ingested from skills via a portable interface; finding codes map to human-readable rule labels (ANAT-D → "Component anatomy (definition)", CRAFT-C → "Design craft (critique)", etc.).

**GraphConstraintAdapter** extracts the dependency graph from stored file and import nodes, then validates layer constraints—preventing cross-layer imports that aren't explicitly allowed. It normalizes paths (forward slashes, relative to a root) and resolves files to layers using minimatch patterns, returning violations that include source location and which layers were crossed.

Both are idempotent; re-running with the same inputs produces no duplicates thanks to GraphStore's keyed merge semantics.

## Invariants

- One design_constraint node per unique finding code, shared across all violating files; re-records update mostRecentMessage and mostRecentSeverity
- recordFindings is idempotent — edge deduping is keyed on (from, to, type) triplet; same findings recorded twice yield one edge
- CODE_PREFIX_LABELS is the sole source of rule labels; missing prefixes default to 'Design constraint'
- File nodes are NOT created by recordFindings; they must exist in the graph from prior ingest (edges are stored regardless)
- violates_design edge metadata: line, evidence, runId are optional; severity and message are required
- Layer matching is first-win — resolveLayer returns the first layer whose patterns match the file path; pattern order determines precedence
- Cross-layer validation only checks imports across different layers; same-layer imports always pass
- File paths are normalized to POSIX (forward slashes) and relative to rootDir before layer resolution
- Edge metadata fallbacks: importType defaults to 'static', line defaults to 0 if missing
- File-node path resolution uses node.path ?? node.id; both forms are valid identifiers for edge endpoints

## Interface Contract

```ts
export DesignConstraintAdapter
export GraphConstraintAdapter
```

## Dependency Slice

```
import { GraphStore } from '../store/GraphStore.js'
import { minimatch } from 'minimatch'
import { relative } from 'node:path'
```
