---
'@harness-engineering/graph': minor
'@harness-engineering/cli': minor
---

feat: configurable domain inference for the knowledge pipeline.

**`@harness-engineering/graph`:**

- New shared helper `inferDomain(node, options)` at `packages/graph/src/ingest/domain-inference.ts`. Exported from the package barrel along with `DomainInferenceOptions`, `DEFAULT_PATTERNS`, `DEFAULT_BLOCKLIST`.
- Built-in patterns cover common monorepo conventions: `packages/<dir>`, `apps/<dir>`, `services/<dir>`, `src/<dir>`, `lib/<dir>`.
- Reserved blocklist prevents misclassification of infrastructure paths: `node_modules`, `.harness`, `dist`, `build`, `.git`, `coverage`, `.next`, `.turbo`, `.cache`, `out`, `tmp`.
- Generic first-segment fallback after blocklist filter; preserves existing `KnowledgeLinker` connector-source branch and the `metadata.domain` highest-precedence behavior.
- Refinements: code-extension allowlist (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`) so directories with dots in names like `foo.bar/` retain their full segment; symmetric blocklist returns `'unknown'` when a pattern captures a blocklisted segment instead of bleeding into the generic fallback.
- Wired into `KnowledgeStagingAggregator`, `CoverageScorer`, and `KnowledgeDocMaterializer`. Each gains an optional `inferenceOptions: DomainInferenceOptions = {}` constructor parameter — back-compat preserved for single-arg construction.
- `KnowledgePipelineRunner` accepts `inferenceOptions` on its per-run options and threads to all four construction sites.
- Test coverage: 19 unit tests for the helper + 11 wiring/integration tests across consumer classes + 3 end-to-end fixture tests.

**`@harness-engineering/cli`:**

- New optional config: `knowledge.domainPatterns: string[]` and `knowledge.domainBlocklist: string[]` on `HarnessConfigSchema`. Pattern format is the literal `prefix/<dir>` (regex `^[\w.-]+\/<dir>$`); blocklist entries are non-empty strings. Both default to `[]` and **extend** the built-in defaults rather than replacing them.
- `harness knowledge-pipeline` reads both fields via `resolveConfig()` and maps them to the runner's `inferenceOptions.extraPatterns` / `extraBlocklist`.
- 22 schema validation tests covering valid populated / valid empty / valid absent / invalid pattern / invalid blocklist element / default-propagation cases.

**Documentation:**

- `docs/reference/configuration.md` — new `knowledge` section documenting both fields, the built-in defaults, the precedence order, both refinements, and a worked `agents/<dir>` example.
- `docs/knowledge/graph/node-edge-taxonomy.md` — new "Domain Inference" section with a 6-row precedence-walkthrough table.
- `agents/skills/claude-code/harness-knowledge-pipeline/SKILL.md` — one-line note in EXTRACT phase pointing at the config override.

**Known follow-up:** Phase 6 verification showed the real-repo `unknown` bucket did not close as projected on this monorepo (helper + wiring + integration test all pass independently, but the production pipeline runtime path appears to lose `node.path` between extraction and aggregation). The diagnostic is filed as `Diagnose pipeline node-path loss for domain inference` on the roadmap.

Spec: `docs/changes/knowledge-domain-classifier/proposal.md`. Verification report: `docs/changes/knowledge-domain-classifier/verification/2026-05-03-phase6-report.md`.
