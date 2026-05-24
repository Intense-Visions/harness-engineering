# audit-brand-compliance v1

> Rule-based brand-semantics audit. Detects (a) tokens used in forbidden contexts per their `$extensions.harness.brand.forbidden_contexts` metadata and (b) string literals (JSX text + string-typed props) that contain forbidden phrases declared in `DESIGN.md ## Brand Rules`. The 4th composed verifier in `harness check-design`, alongside audit-component-anatomy, design-craft critique, and detect-design-drift. Triggers extraction of the `Verifier<F>` interface that was deferred until the 4th data point.

## Overview

**Project:** audit-brand-compliance (v1)
**Initiative:** design-pipeline (sub-project #3 of 6 — the last unshipped floor-layer audit)
**Date:** 2026-05-24
**Estimated effort:** ~1 week, single PR
**Unblocks:** design-pipeline sub-project #5 (the orchestrator). Floor layer fully closes when this merges.

### What this ships

Two rule families in v1 — a narrow + deep scope chosen to ship the foundation and prove the brand-semantics pattern without ballooning into voice/tone/asset territory:

- **BRAND-T\*** — token-misuse rules. For each token whose `$extensions.harness.brand` declares `forbidden_contexts: [...]`, scan call sites where the token is referenced and flag matches.
- **BRAND-V001** — single voice rule: string literals (JSX text nodes and string-typed props) containing any phrase declared in `DESIGN.md ## Brand Rules → voice.forbidden_phrases`. Case-insensitive substring match.

Both rule families compose into `harness check-design` as the 4th verifier. This triggers extraction of `Verifier<F>` (the formal interface deferred until 4 data points), per the verifier-shape convention note in check-design.ts.

### What this does NOT ship

- **No tone-by-context rules.** Detecting empty/error/success/loading state context from JSX requires component-state inference — substantial new surface; deferred to v1.x.
- **No reading-level / sentence-length rules.** v1 ships only forbidden-phrase voice detection. Flesch-Kincaid and sentence-word-count are mechanically cheap but produce noisy findings without good tone-context attachment; deferred until tone-context lands.
- **No asset-usage rules.** Logo size limits, monochrome-on-photo constraints, etc. require image-tag scanning + filesystem checks + optional image-metadata inspection. Asset rules ship as v1.x.
- **No semantic-token-alias enforcement.** `brand_primary: color.brand.500` aliases (DESIGN.md `### Semantic Token Aliases`) are declared in v1 schema but enforced by audit only in v1.x — the rule "raw color reference X should use the alias `brand_primary`" overlaps with detect-design-drift's T001 and benefits from being designed once both have shipped.
- **No DESIGN.md authoring.** Editing `## Brand Rules` is a human (or `harness-design` skill) job. audit-brand-compliance reads only.
- **No graph writes for brand findings yet.** v1 routes findings through the same `DesignConstraintAdapter.recordFindings()` path as anatomy/craft/drift — no schema changes; the `VIOLATES_design` edge subsumes brand violations under the same edge type. v1.x may add a brand-specific edge for queryability.

### What problem this solves

Today brand compliance is enforced by humans reviewing PRs against a prose brand doc. Per ADR 0028, harness's bet is that brand rules need to be a structured, machine-readable source of truth that's adjacent to (not separate from) design tokens. audit-brand-compliance is the first programmatic enforcer of that schema — it turns the `forbidden_phrases` list and the `$extensions.harness.brand.forbidden_contexts` metadata from "convention" into "fail this CI." Without it, ADR 0028's schema sketch is just a draft; with it, projects accumulate brand discipline the same way they accumulate type discipline.

## Decisions

| #   | Decision                 | Lock                                                                       | Rationale                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------ | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | v1 rule scope            | **BRAND-T\* (token misuse) + BRAND-V001 (forbidden phrases)**              | Narrow + deep. Token misuse extends detect-drift's scanning pattern (low marginal cost). Forbidden phrases introduces the new copy-scanner with the simplest possible rule (substring match). Defers reading-level, tone-by-context, and asset rules to v1.x — each is its own brainstorm-sized problem.   |
| 2   | Input sources            | **DESIGN.md `## Brand Rules` AND tokens.json `$extensions.harness.brand`** | ADR 0028 mandates both. v1 ships parsers for both — same dual-resolver pattern as detect-design-drift (tokens resolver + component-registry resolver). Either resolver absent: matching rule family skips silently.                                                                                        |
| 3   | check-design composition | **4th verifier (triggers `Verifier<F>` interface extraction)**             | check-design's convention note explicitly cited the 3rd-check-\* threshold; brand makes it the 4th data point. Long-deferred interface extraction is now load-bearing: 4 verifiers all duplicating `{ findings, summary, catalog, meta }` shape is past the cost/benefit line. Extract as part of this PR. |

## Scope

### In-scope

- **BRAND-T\* token-misuse rule.** For each token with `$extensions.harness.brand.forbidden_contexts: [...]`, scan source for references to that token's dotted path AND infer call-site context. Context inference v1 uses JSX-attribute-name + nearest-component-name heuristics:
  - `BRAND-T001` — token used in a context name explicitly listed in `forbidden_contexts`
  - Context inference v1 vocabulary: `cta`, `selection`, `focus`, `data-visualization`, `decorative`, `background`, `text`, `border`, `error`, `success`, `warning` (matches the ADR's sketched vocabulary)
- **BRAND-V001 forbidden-phrases rule.** Scan `.tsx`/`.jsx` files with the TypeScript Compiler API (mirrors primitive-adoption-rule). For each JSX text node + string-typed JSX attribute value, check whether any `voice.forbidden_phrases` entry appears as a case-insensitive substring. Flag matches.
- **DESIGN.md `## Brand Rules` parser.** Loads `voice`, `tone_by_context`, `assets`, `semantic_token_aliases` blocks. v1 USES only `voice.forbidden_phrases`. The others are parsed-but-unused (forward-compatibility — no breaking changes when v1.x adds their rules).
- **tokens.json `$extensions.harness.brand` walker.** Extends `loadTokenPathIndex` to also capture per-token `role`, `approved_contexts`, `forbidden_contexts`. Returns a `BrandTokenIndex` keyed by token path.
- **`Verifier<F>` interface extraction.** New `packages/cli/src/shared/verifier.ts` defining the formal shape all 4 verifiers conform to:
  ```ts
  interface Verifier<F, Cat = {}, Meta = {}> {
    findings: F[];
    summary: {
      totalFiles: number;
      durationMs: number;
      bySeverity: Record<'error' | 'warn' | 'info', number>;
      byCode: Record<string, number>;
    };
    catalog: Cat;
    meta: Meta;
  }
  ```
  Anatomy/craft/drift/brand all declare conformance via type aliases. Compile-time check that future verifiers stay shape-consistent.
- **MCP tool `audit_brand`.** Programmatic API. Input `{ path, mode, files?, designStrictness?, rules? }`. Output the Verifier shape (`{ findings, summary, catalog, meta }`).
- **CLI integration.** No new top-level CLI command in v1 — brand is reached via `harness check-design` (4th verifier). Direct CLI for brand-alone debugging is added in v1.x if real-world signal calls for it.
- **`harness validate` fast-mode hook.** Brand audit runs alongside anatomy and drift in `harness validate`. Gated by `design.audit.brandCompliance.enabled` (default `true`).
- **Config schema extension.** New `design.audit.brandCompliance` block under `DesignAuditConfigSchema` (sibling to `componentAnatomy` and `driftDetection`).
- **4-platform skill markdown.** claude-code / codex / cursor / gemini-cli.

### Out-of-scope (v1)

- **No tone-by-context rules.** Requires inferring component state (empty/error/success/loading) from JSX — see v1.x.
- **No reading-level / sentence-length rules.** Ship when tone-context lands so they can be attached per-context (not blanket-applied).
- **No asset-usage rules.** Image-tag scanning + file-existence + image-metadata is its own surface; v1.x.
- **No semantic-token-alias enforcement.** Overlaps with detect-drift T001; design once both have real usage.
- **No autofix.** audit-only — fix-side analog is a separate sibling sub-project (`align-brand-compliance`, deferred until detect signals demand).
- **No brand-rule authoring.** DESIGN.md edits are human / `harness-design` skill work.
- **No standalone `harness audit-brand` CLI command.** Goes through `harness check-design` in v1; direct command added v1.x if needed.
- **No new graph node types.** v1 reuses `VIOLATES_design` edge via `DesignConstraintAdapter.recordFindings`. Brand-specific edge (`VIOLATES_brand`?) deferred.

## Inputs

- **`design-system/DESIGN.md` `## Brand Rules` section.** Markdown structure parsed per ADR 0028 schema sketch. v1 reads `voice.forbidden_phrases` (list of strings). Other blocks (`tone_by_context`, `assets`, `semantic_token_aliases`) parsed but unused — forward-compat. Returns `null` when section absent → BRAND-V001 silently skips.
- **`design-system/tokens.json` `$extensions.harness.brand`.** Walked alongside the existing `loadTokenSet` walk. For each token with a `harness.brand` extension object, capture `role`, `approved_contexts: string[]`, `forbidden_contexts: string[]`. Returns `null` when no tokens carry the extension → BRAND-T\* silently skips.
- **harness.config.json** — `design.audit.brandCompliance.{enabled, rules}`. New sub-block.

## Outputs

```ts
interface BrandFinding {
  code: BrandFindingCode;
  severity: 'error' | 'warn' | 'info';
  file: string;
  line: number | null;
  column?: number;
  message: string;
  evidence: { snippet: string };
  rule: { id: string; category: 'token-misuse' | 'voice' };
  fix: { kind: 'manual' | 'codemod-todo'; description: string };
}

type BrandFindingCode = `BRAND-T${string}` | `BRAND-V${string}`;
```

```ts
interface AuditBrandOutput {
  findings: BrandFinding[];
  summary: {
    totalFiles: number;
    durationMs: number;
    bySeverity: Record<'error' | 'warn' | 'info', number>;
    byCode: Record<string, number>;
  };
  catalog: { rulesApplied: string[] };
  meta: {
    mode: 'fast' | 'full';
    designMdLoaded: boolean;
    brandTokensLoaded: boolean;
  };
}
```

This is the Verifier shape, formalized as a typed interface by this PR.

## Technical Design

### Module layout

```
packages/cli/src/brand/
  findings/
    finding.ts             # BrandFinding type + severity model
  resolvers/
    design-md-brand.ts     # parse DESIGN.md ## Brand Rules
    token-extensions.ts    # walk tokens.json for $extensions.harness.brand
  rules/
    token-misuse-rule.ts   # BRAND-T*
    forbidden-phrases-rule.ts  # BRAND-V001
  index.ts                 # runAuditBrand orchestrator
packages/cli/src/mcp/tools/
  audit-brand.ts           # MCP wrapper
packages/cli/src/shared/
  verifier.ts              # NEW — Verifier<F, Cat, Meta> interface
```

Co-located under `packages/cli/src/` (same convention as anatomy / design-craft / drift / align).

### DESIGN.md ## Brand Rules parser (v1 scope)

The parser extracts:

```ts
interface BrandRules {
  voice: {
    constant?: string;
    forbiddenPhrases: string[];
    readingLevel?: number;
    maxSentenceWords?: number;
  } | null;
  toneByContext: Record<string, string> | null; // parsed, unused in v1
  assets: {
    logo?: { primary?: string; variations?: Array<{ use: string; path: string }> };
    forbiddenAssetUses?: Array<{ rule: string }>;
  } | null; // parsed, unused
  semanticTokenAliases: Record<string, string> | null; // parsed, unused
}
```

Section delimiters: `## Brand Rules` to next H2 (`##`). Subsections (`### Voice`, `### Tone by Context`, etc.) parsed as YAML-ish key-value blocks (tolerant; matches the ADR sketch's indented form). Returns `null` if `## Brand Rules` is absent.

### tokens.json $extensions walker

Extends the existing `loadTokenPathIndex` walk with a parallel pass that captures the brand extension:

```ts
interface BrandTokenInfo {
  path: string;
  role?: string;
  approvedContexts: string[];
  forbiddenContexts: string[];
}

interface BrandTokenIndex {
  byPath: Map<string, BrandTokenInfo>;
}
```

Returns `null` (instead of empty index) when no token carries the extension — same silent-skip pattern as the existing resolvers.

### BRAND-T\* token-misuse rule (v1 detection)

Detection approach: regex-first per finding-density expectation. For each `BrandTokenInfo` with non-empty `forbiddenContexts`:

1. Find every reference to the token's dotted path in the source (`tokens.color.brand.500`, `var(--color-brand-500)`, `'color.brand.500'`).
2. Inspect the surrounding source context (same line + immediate previous/next non-blank line) for the v1 context-vocabulary keywords (`cta`, `selection`, `focus`, `data-visualization`, `decorative`, `background`, `text`, `border`, `error`, `success`, `warning`).
3. If a forbidden context matches: emit `BRAND-T001`.

v1's context inference is intentionally simple. Misses are acceptable (find the obvious cases); false positives must be near-zero (the user is being told their design system is being violated). Errors-on-the-side-of-conservative.

### BRAND-V001 forbidden-phrases rule (v1 detection)

TS Compiler API walk over `.tsx`/`.jsx` files (mirrors primitive-adoption-rule):

- Visit each `ts.JsxText` node → extract text → case-insensitive substring scan against each `voice.forbiddenPhrases` entry.
- Visit each `ts.JsxAttribute` whose initializer is a string literal → extract value → same scan.
- Emit `BRAND-V001` per match (deduplicated per `file:line:phrase`).

System: only `.tsx`/`.jsx` files in v1. `.md` files (README, AGENTS) considered out-of-scope — copy in docs is a different audience than copy in product UI.

### Severity model

Same shape as drift/anatomy (uses `severityFor`):

| Code       | strict | standard | permissive |
| ---------- | ------ | -------- | ---------- |
| BRAND-T001 | error  | error    | info       |
| BRAND-V001 | error  | warn     | info       |

Token misuse maps to `error` in standard because the user has explicitly declared "this token must not be used here." Forbidden phrases map to `warn` in standard because copy is more nuanced (some matches may be intentional in edge contexts).

### `Verifier<F>` interface extraction

```ts
// packages/cli/src/shared/verifier.ts
export interface VerifierSummary {
  totalFiles: number;
  durationMs: number;
  bySeverity: Record<'error' | 'warn' | 'info', number>;
  byCode: Record<string, number>;
}

export interface Verifier<F, Cat = Record<string, unknown>, Meta = Record<string, unknown>> {
  findings: F[];
  summary: VerifierSummary;
  catalog: Cat;
  meta: Meta;
}
```

Each existing verifier output gets a type-alias declaring conformance:

```ts
// drift/index.ts
export type DetectDriftOutput = Verifier<
  DriftFinding,
  { rulesApplied: string[] },
  { mode: DetectDriftMode; tokensLoaded: boolean; registryLoaded: boolean }
>;
```

The interface is structural in TypeScript, so existing implementations satisfy it without code changes — only type-alias additions. Compile-time check that future verifiers conform.

### Composition into check-design

check-design.ts:

```ts
import { runAuditBrand } from '../mcp/tools/audit-brand';
import type { BrandFinding } from '../brand/findings/finding';

interface CheckDesignResult {
  findingsByVerifier: {
    anatomy: AnatomyFinding[];
    craft: CraftFinding[];
    drift: DriftFinding[];
    brand: BrandFinding[]; // NEW
  };
  // ...
}
```

Adds a VERIFIER 4 try/catch block mirroring VERIFIER 3 (drift). Aggregation summary extended. `persistFindings` signature extended to 4 arrays (mapping brand findings → CraftFindingRecord same way drift does).

### Graph state

No new node/edge types in v1. `BrandFinding` maps to `CraftFindingRecord` via `DesignConstraintAdapter.recordFindings()` — same path as anatomy/craft/drift. v1.x may add `VIOLATES_brand` edge for queryability.

### Knowledge entries

None required for v1. v1.x with tone-by-context rules may add `docs/knowledge/design/brand-tone-context.md` if the vocabulary needs documenting separately from the schema.

## Surface area

### CLI

No standalone `harness audit-brand` command in v1. Brand audit runs via:

- `harness check-design` (composes all 4 verifiers; recommended path)
- `harness validate` (fast-mode hook gated by `design.audit.brandCompliance.enabled`)

Direct CLI added in v1.x if real-world signal warrants it.

### MCP tool

`audit_brand` — input/output match the function call. Consumed by check-design and the (future) #5 orchestrator. Tool count bumps 72 → 73.

### Config

```ts
design.audit.brandCompliance: {
  enabled: boolean;          // default true
  rules: {
    tokenMisuse: boolean;    // default true
    voice: boolean;          // default true
  };
  fastMode: { maxFiles: number };  // default 500
}
```

## Verifier interface extraction (cross-cutting)

This PR extracts `Verifier<F>` into `packages/cli/src/shared/verifier.ts` because the 4th-verifier threshold is met. Touchpoints:

- `packages/cli/src/audit/component-anatomy/index.ts` — type alias `AuditAnatomyOutput = Verifier<...>`
- `packages/cli/src/design-craft/index.ts` — same
- `packages/cli/src/drift/index.ts` — same
- `packages/cli/src/brand/index.ts` — same (new)
- `packages/cli/src/commands/check-design.ts` — composer can now type its `findingsByVerifier` map against the shared interface

Zero runtime change. All-additive at the type level.

## Rationalizations to reject

| Rationalization                                                    | Why it's wrong                                                                                                                                                                                                               |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Tone-by-context is the most valuable rule family — ship it in v1" | Tone-by-context requires component-state inference from JSX (empty/error/success/loading). That's a brainstorm-sized problem. v1 ships the foundation; v1.x ships tone once the state-inference pattern is proven elsewhere. |
| "Reading-level is mechanically cheap — include it"                 | Cheap to compute, noisy without context attachment (a button label is one word; an error message is a paragraph). Ship with tone-context so context-appropriate thresholds can apply.                                        |
| "Scan .md files for voice rules"                                   | Doc copy is a different audience (developers) than product copy (users). Brand voice rules target product copy; doc rules belong in a future docs-voice skill (craft-pipeline).                                              |
| "Add a `VIOLATES_brand` graph edge now"                            | Graph schema additions are sticky. v1 routes through existing `VIOLATES_design`; when consumers actually query brand-only, add the edge.                                                                                     |
| "Skip the Verifier interface extraction — it's premature"          | Premature at 2 data points. Load-bearing at 4. The verifier-shape convention comment in check-design.ts explicitly named this trigger.                                                                                       |
| "Ship a standalone `harness audit-brand` CLI command"              | YAGNI. check-design composes all 4; direct CLI adds maintenance with no proven need. Add in v1.x if real users ask for it.                                                                                                   |
| "Make BRAND-V001 use AST-level full-string equality"               | Forbidden phrases are typically partial-match phrases ("click here", "best-in-class"). Case-insensitive substring match is the right tool. Whole-word boundaries are a v1.x refinement.                                      |
| "Scan all string literals, not just JSX text + attributes"         | All-string-literals scan would flag forbidden phrases in test fixtures, error-message constants used by non-UI code, etc. JSX scope keeps the audit focused on user-visible copy.                                            |
| "Enforce semantic_token_aliases in v1"                             | Overlaps detect-drift T001 — same surface scanned twice with two different verdicts. Design once both rules have shipped and we can see the real overlap pattern.                                                            |

## Success criteria

**Resolver correctness (8)**

1. DESIGN.md `## Brand Rules` parser returns null when section is absent
2. Parser returns voice.forbiddenPhrases as a string array even when other voice fields are absent
3. Parser tolerates indented YAML-ish syntax (matches the ADR sketch's form)
4. Parser stops at the next H2 (does not bleed into adjacent sections)
5. tokens.json $extensions walker returns null when no token carries `harness.brand`
6. Walker captures `role`, `approvedContexts`, `forbiddenContexts` per token
7. Walker handles missing optional fields (e.g., `forbidden_contexts` absent → empty array)
8. Both resolvers' return types are exported and unit-tested independently

**BRAND-T001 correctness (6)**

9. Token reference `tokens.X.Y.Z` IS recognized as referring to token path `X.Y.Z`
10. Token reference `var(--X-Y-Z)` IS recognized as referring to token path `X.Y.Z`
11. String literal `'X.Y.Z'` IS recognized as a token-path reference
12. Token with empty `forbiddenContexts` produces zero BRAND-T001 findings even when referenced
13. Context inference recognizes the v1 vocabulary keywords (cta / selection / focus / etc.)
14. Token used in an approved context does NOT fire BRAND-T001 (only forbidden_contexts matches)

**BRAND-V001 correctness (6)**

15. JSX text node `<p>Click here</p>` fires BRAND-V001 when "click here" is forbidden
16. Case-insensitive: `<p>CLICK HERE</p>` also fires
17. JSX string-typed attribute `title="best-in-class"` fires
18. Same phrase on same line+file is deduplicated (no double-emit per finding)
19. `.ts` files are NOT scanned (rule only fires on .jsx/.tsx)
20. JSX fragments and nested elements are walked correctly (full TS Compiler API tree traversal)

**Verifier interface extraction (4)**

21. `packages/cli/src/shared/verifier.ts` exists and exports `Verifier<F, Cat, Meta>` + `VerifierSummary`
22. `DetectDriftOutput`, `AuditAnatomyOutput`, `DesignCraftValue`, `AuditBrandOutput` all conform structurally (type-alias declaration, not refactor)
23. Adding a 5th verifier requires only declaring conformance — no shape-duplication
24. Compile-time check: removing `bySeverity` from any verifier output causes type error in check-design

**check-design composition (4)**

25. `findingsByVerifier.brand: BrandFinding[]` appears in CheckDesignResult
26. VERIFIER 4 try/catch added (degrades gracefully on brand failure)
27. Brand findings flow into `persistFindings` (4-array signature)
28. check-design test extended for 4-verifier case (existing 3-verifier tests still pass)

**Surface area + tool count (3)**

29. MCP tool `audit_brand` registered (count 72 → 73)
30. `harness validate` runs brand audit when `design.audit.brandCompliance.enabled !== false`
31. 4-platform skill markdown shipped (claude-code / codex / cursor / gemini-cli)

**Config + docs (3)**

32. New `design.audit.brandCompliance` Zod sub-schema validates round-trip
33. Auto-doc regenerates with `audit_brand` MCP tool entry + `audit-brand-compliance` skill entry
34. Changeset describes the new audit + Verifier interface extraction

## Long-term trajectory

- **v1.x — BRAND-Tone\*** rules. Component-state inference from JSX (detect "this is an empty state" / "this is an error state" / etc.) → tone-by-context rule fires when state's tone-target doesn't match the surrounding copy's character.
- **v1.x — BRAND-V002 reading-level** and **BRAND-V003 sentence-length**, attached per tone-context (different thresholds for button labels vs body copy).
- **v1.x — BRAND-A\*** asset rules. Logo size, monochrome-context enforcement, image-tag scanning + filesystem checks.
- **v1.x — Semantic-token-alias enforcement.** Designed after detect-drift T001 and audit-brand T-misuse have real usage; resolve the overlap.
- **v1.x — Standalone `harness audit-brand` CLI** if real-world signal calls for direct-invocation use cases.
- **v2 — `align-brand-compliance`** sibling FIX skill. Forbidden-phrase suggestions ("click here" → "open the document"); token-misuse codemods that swap to an approved alias.
- **v2 — `VIOLATES_brand` graph edge.** Brand findings get a dedicated edge type so consumers can query brand-only violation history.
- **v3 — LLM-judgment tone rules.** Pairs with craft-pipeline #5 copy-craft. Rule-based audit catches the clear violations; LLM-judgment skill catches the subtler tone misalignments.

## Risks + mitigations

| Risk                                                                                | Mitigation                                                                                                                                                                            |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BRAND-T001 false positives when a token reference appears far from its real context | v1 inspects ONLY the same line + adjacent non-blank lines. Misses far-context cases; near-zero false positives. v1.x adds richer context inference once tone-by-context lands.        |
| Forbidden-phrase substring matching too eager (e.g., "as is" in "as issued")        | v1 uses substring; v1.x adds word-boundary regex. False positives surface fast in practice — accept the v1 simplicity, refine on signal.                                              |
| DESIGN.md schema drift between projects                                             | ADR 0028's schema is the v1 truth. Parser is tolerant (missing subsections → null); schema additions in v2 are forward-compat (parser ignores unknown subsections).                   |
| Tokens with `harness.brand` extension are rare in v1 (no project has them yet)      | Expected — the audit ships when there's structure to enforce. Both resolvers silently skip when input is absent; projects opt in by adding the extension/section.                     |
| Verifier interface extraction breaks an existing verifier's type                    | Interface is structural; existing code satisfies it without refactor. PR-time TS check is the test. Migration is type-alias addition only.                                            |
| Configuration sprawl: `design.audit.{anatomy,drift,brand}` block trio is heavy      | All three are independent gates serving distinct purposes. Sprawl IS the contract — each sub-project owns its block. v2 may introduce `design.audit.all.{enabled,strictness}` rollup. |

## Open questions deferred to implementation

- **Context-inference vocabulary expansion.** v1 ships the ADR's sketched vocabulary (`cta`, `selection`, `focus`, `data-visualization`, `decorative`, etc.). v1.x extension drivers: real projects' DESIGN.md content + actual finding patterns.
- **Multi-line JSX text handling.** A `<p>` with multi-line text — does forbidden-phrase scan operate on the joined text or per-line? v1 joins (semantically correct: phrase may span lines). Implementation detail; spec'd here but not gated on user input.
- **Tokens.json $extensions schema validation.** v1 trusts whatever's in the JSON. v1.x may add a Zod schema for the `$extensions.harness.brand` shape; defer until the schema's used by multiple projects.
  EOF
