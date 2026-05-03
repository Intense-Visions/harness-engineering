# Harness Knowledge Pipeline

> 4-phase knowledge extraction, reconciliation, drift detection, and remediation with convergence loop. Keeps the business knowledge graph current and identifies coverage gaps.

## When to Use

- When you want a full knowledge health check: extract signals, detect drift, find gaps
- After adding new code, connectors, or diagram files that contain business knowledge
- As a periodic hygiene check to ensure the knowledge graph reflects the codebase
- When `--drift-check` is needed in CI to gate on knowledge freshness
- NOT for manually authoring knowledge files (write to `docs/knowledge/` directly)
- NOT for ingesting a single source (use `ingest_source` MCP tool directly)
- NOT for graph queries or exploration (use `ask_graph` or `query_graph`)

## Process

1. **EXTRACT:** Run code signal extractors, diagram parsers, BusinessKnowledgeIngestor, and KnowledgeLinker against the project
2. **RECONCILE:** Build pre-extraction snapshot (current graph state) and post-extraction snapshot, then run StructuralDriftDetector
3. **DETECT:** Partition findings by classification (new/stale/drifted/contradicting), generate gap report
4. **REMEDIATE (only with `--fix`):** Apply safe remediations, convergence loop up to 5 iterations

## Iron Law

**Auto-remediate stale findings only. Prompt for drifted and contradicting.** Never auto-resolve a `contradicting` finding — the human must decide which source is authoritative.

## Flags

| Flag              | Effect                                                           |
| ----------------- | ---------------------------------------------------------------- |
| `--fix`           | Enable convergence-based auto-remediation (default: detect-only) |
| `--ci`            | Non-interactive: apply safe fixes only, report everything else   |
| `--domain <name>` | Limit pipeline to specific knowledge domain                      |

## Shared Context Object

All phases read from and write to a shared `KnowledgePipelineContext`:

```typescript
interface KnowledgePipelineContext {
  extractionSnapshot: KnowledgeSnapshot;
  currentSnapshot: KnowledgeSnapshot;
  driftResult: DriftResult;
  gapReport: GapReport;
  remediationsApplied: string[];
  iteration: number;
  verdict: 'pass' | 'warn' | 'fail';
}
```

---

## Phase 1: EXTRACT

Extract business knowledge from all available sources into a fresh snapshot.

1. **Code Signal Extractors:** Run `ExtractionRunner` against the project directory.
   - Test description extractor
   - Enum/constant extractor
   - Validation rule extractor
   - API path extractor
   - Output goes to `.harness/knowledge/extracted/`

2. **Diagram Parsers:** Run `DiagramParser.ingest()` for diagram-as-code files.
   - Scans for `.mmd`, `.mermaid`, `.d2`, `.puml`, `.plantuml` files
   - Extracts entities and relationships into `business_concept` nodes

3. **Connector Sync** (if configured): Trigger connector sync for Jira, Slack, Confluence.
   - Only runs if connectors are configured in `harness.config.json`
   - Skip silently if no connectors

4. **Build Fresh Snapshot:** Collect all extraction results into a `KnowledgeSnapshot`.
   - Each entry has: `id`, `type`, `contentHash`, `source`, `name`
   - Each entry's `domain` is resolved via path-based inference (`packages/<dir>`, `apps/<dir>`, etc.) unless an explicit `metadata.domain` is set; projects can extend or override via `knowledge.domainPatterns` and `knowledge.domainBlocklist` in `harness.config.json` — see [`docs/knowledge/graph/node-edge-taxonomy.md`](../../../../docs/knowledge/graph/node-edge-taxonomy.md#domain-inference) for full precedence.

**Output:** `context.extractionSnapshot` populated.

---

## Phase 2: RECONCILE

Compare the fresh extraction against the current graph state.

1. **Build Current Snapshot:** Read all `business_*` nodes from GraphStore.
   - Map each node to a `KnowledgeSnapshotEntry`
   - Use node ID as entry ID, compute contentHash from node content

2. **Run Drift Detection:** Call `StructuralDriftDetector.detect(current, fresh)`.
   - Produces `DriftResult` with findings classified as `new`, `drifted`, `stale`, `contradicting`
   - Produces `driftScore` (0.0 - 1.0)

**Output:** `context.currentSnapshot` and `context.driftResult` populated.

---

## Phase 3: DETECT

Partition drift findings and classify safety.

1. **Partition by classification:**

   | Classification  | Severity | Safety        | Action                    |
   | --------------- | -------- | ------------- | ------------------------- |
   | `new`           | low      | safe          | Stage automatically       |
   | `stale`         | high     | probably-safe | Auto-remove (source gone) |
   | `drifted`       | medium   | probably-safe | Prompt for confirmation   |
   | `contradicting` | critical | unsafe        | Never auto-resolve        |

2. **Generate Drift Report:** Present findings grouped by classification:

   ```
   KNOWLEDGE PIPELINE -- Drift Detection

   Drift Score: 0.23 (12 findings / 52 entries)

   NEW (4 findings, safe):
     - business_rule:payments:refund-window [extractor]
     - business_concept:auth:session-timeout [diagram]
     ...

   STALE (3 findings, probably-safe):
     - business_fact:billing:old-rate-limit [extractor] — source file deleted
     ...

   DRIFTED (4 findings, requires confirmation):
     - business_rule:checkout:tax-calculation [extractor] — content changed
     ...

   CONTRADICTING (1 finding, requires human decision):
     - business_term:Settlement SLA — extractor says 24h, linker says 48h
   ```

3. **Generate Gap Report:** Run `KnowledgeStagingAggregator.generateGapReport()`.
   - Lists domains with entry counts
   - Write to `.harness/knowledge/gaps.md`

**Output:** Drift report and gap report written. `context.gapReport` populated.

---

## Phase 4: REMEDIATE (only with `--fix`)

Apply safe fixes and converge.

1. **Stage `new` findings:** Write to `.harness/knowledge/staged/pipeline-staged.jsonl` via `KnowledgeStagingAggregator`.

2. **Auto-remove `stale` findings:** Remove nodes from graph where source file no longer exists.
   - Log each removal

3. **Present `drifted` findings:** Ask the human to confirm each update.
   - In `--ci` mode: skip, report as unresolved
   - If confirmed: update the graph node with fresh content

4. **Surface `contradicting` findings:** Never auto-resolve.
   - Present both sources and ask the human which is authoritative
   - In `--ci` mode: report as unresolved

5. **Convergence Check:** After remediation:
   - Re-run EXTRACT + RECONCILE + DETECT
   - Count remaining findings
   - If `newCount >= previousCount`: STOP (converged or no progress)
   - If `newCount < previousCount`: continue (max 5 iterations)

### Convergence Loop

```
maxIterations = 5
previousCount = findings.length

while iteration < maxIterations:
  1. Apply safe remediations (new → stage, stale → remove)
  2. Present probably-safe remediations (skip in --ci)
  3. Log unsafe findings (never auto-apply)
  4. Re-run EXTRACT + RECONCILE + DETECT
  5. newCount = remaining findings
  6. if newCount >= previousCount: STOP (converged)
  7. previousCount = newCount; iteration++
```

---

## Verdict Rules

After all phases complete, compute verdict:

| Verdict | Condition                                         |
| ------- | ------------------------------------------------- |
| `pass`  | Zero unresolved findings after pipeline           |
| `warn`  | Only `new` findings remain (low severity)         |
| `fail`  | Any `contradicting`, `stale`, or `drifted` remain |

Present verdict summary:

```
KNOWLEDGE PIPELINE -- Verdict: WARN

Findings: 2 new (staged), 0 stale, 0 drifted, 0 contradicting
Gap Report: 3 domains, 12 total entries
Drift Score: 0.04
```

## Harness Integration

- **`ingest_source`** -- MCP tool for ingesting diagram sources (`source: 'diagrams'`)
- **`ExtractionRunner`** -- Code signal extraction from `@harness-engineering/graph`
- **`DiagramParser`** -- Diagram-as-code parsing from `@harness-engineering/graph`
- **`StructuralDriftDetector`** -- Drift detection from `@harness-engineering/graph`
- **`KnowledgeStagingAggregator`** -- Staging and gap reporting from `@harness-engineering/graph`
- **`harness validate`** -- Run after remediation to verify project health

## Success Criteria

1. All 4 phases execute in sequence (EXTRACT, RECONCILE, DETECT, REMEDIATE)
2. Drift detection correctly classifies findings into 4 categories
3. Auto-remediation only applies to safe/probably-safe findings
4. Contradicting findings are never auto-resolved
5. Convergence loop terminates when finding count stops decreasing (max 5 iterations)
6. Gap report lists domains with entry counts
7. Verdict accurately reflects remaining finding state
8. `--ci` mode is fully non-interactive

## Examples

### Example: Running detect-only pipeline

```
$ harness knowledge-pipeline

KNOWLEDGE PIPELINE -- Verdict: WARN

  Drift Score: 0.12
  Findings: 3 new, 0 stale, 0 drifted, 0 contradicting
  Extraction: 12 code signals, 5 diagrams, 2 linker facts, 4 business knowledge
  Gaps: 2 domains, 16 total entries
```

### Example: Running with fix mode

```
$ harness knowledge-pipeline --fix

KNOWLEDGE PIPELINE -- Verdict: PASS

  Drift Score: 0.00
  Findings: 0 new, 0 stale, 0 drifted, 0 contradicting
  Extraction: 12 code signals, 5 diagrams, 2 linker facts, 4 business knowledge
  Gaps: 2 domains, 19 total entries
  Convergence: 2 iterations
  Remediations: 3 applied
```

### Example: CI gate mode

```
$ harness knowledge-pipeline --ci --drift-check
# Exits 1 if unresolved drift exists
```

## Rationalizations to Reject

| Rationalization                                                                      | Reality                                                                                                                                             |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| "The contradicting findings have an obvious resolution, so I can auto-fix them"      | The Iron Law: contradicting findings require human decision. Different sources may have different authority levels that only the human understands. |
| "Drift score is low (0.05), so I can skip the DETECT phase and go straight to PASS"  | Every finding must be classified regardless of drift score. A low score with one critical contradiction is still a FAIL.                            |
| "The stale entries might come back if the source is restored, so I should keep them" | Stale means the source is gone now. If it comes back, the next extraction will find it as NEW. Keeping stale entries pollutes the graph.            |
| "I can run the convergence loop more than 5 times to get to zero findings"           | The 5-iteration cap is a safety bound. If findings aren't decreasing, more iterations won't help — the remaining issues need human intervention.    |

## Gates

- **No auto-resolution of contradicting findings.** EVER. Present both sources, ask the human.
- **No skipping DETECT.** Even in `--fix` mode, DETECT must run before REMEDIATE.
- **No convergence beyond 5 iterations.** If findings aren't decreasing, stop and report.
- **No REMEDIATE without `--fix`.** Default mode is detect-and-report only.

## Escalation

- **When no graph is available:** Run extractors and diagram parsers only. Skip reconciliation (no current snapshot). Report extraction results as gap analysis.
- **When connectors fail:** Log the error, continue with available sources. Note which connectors were skipped in the report.
- **When convergence stalls at iteration 1:** All remaining findings require human intervention. Present them and stop.
