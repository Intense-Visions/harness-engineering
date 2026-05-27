# Align Design System

> Apply codemods for safe DRIFT-T001/T002/T003 token-bypass findings (replace hex / font-family / px-spacing literals with token references) and emit precise suggestions for DRIFT-T004 (deprecated tokens) and all DRIFT-P\* (primitive adoption). The FIX half of design-pipeline sub-project #1, paired with detect-design-drift.

## When to Use

- After detect-design-drift reports DRIFT-T001/T002/T003 findings — align replaces literals with token references where the fix is unambiguous
- Before a PR that touches UI code lands — pair with detect-design-drift to surface AND fix drift in one shot
- Inside a (future) #5 design-pipeline orchestrator's convergence loop — align is the FIX step the loop runs between DETECT and VERIFY
- When you want to dry-run the fixes first (`--dry-run`) and review the diff before writing
- NOT for primitive-adoption codemods — v1 emits suggestions only for DRIFT-P\*; the prop-translation work lives in v1.x
- NOT for adding new tokens to tokens.json (no auto-add of palette entries; that's a separate intentional act)
- NOT for non-design-system fixes (use cleanup-dead-code, align-documentation, etc. for their respective domains)

## Process

### Phase 1: GATHER — Load drift findings

1. **Read project configuration.** Check `harness.config.json` for:
   - `design.strictness` — passes through to detect-design-drift
   - `design.audit.driftDetection.*` — passes through to detect

2. **In standalone mode (default):** invoke `detect-design-drift` internally with the same project root + strictness; receive the full `DriftFinding[]`.

3. **In pipeline mode:** read `.harness/handoff.json` and pull `pipeline.driftFindings` (pre-classified by the orchestrator). Honor `pipeline.fixBatch` if present to limit application to a specific subset of findings (the orchestrator may apply fixes in batches across iterations).

### Phase 2: CLASSIFY — Pre-flight safe-codemod vs suggestion

For each finding, the pre-flight classifier inspects file context and chooses:

- **DRIFT-T001 (hex)** — safe-codemod iff token import already present in the file AND hex is in single string-literal context (not a template literal or concatenation) AND exactly one palette token matches by value. Otherwise → suggestion.
- **DRIFT-T002 (font-family)** — same shape as T001 against the typography palette.
- **DRIFT-T003 (px spacing)** — safe-codemod iff token import present AND px matches a spacing token's `$value` EXACTLY (no rounding) AND not in an arithmetic expression. Otherwise → suggestion.
- **DRIFT-T004 (deprecated)** — always suggestion in v1. Migration target may not be in the token's `$description`.
- **DRIFT-P\* (primitive adoption)** — always suggestion in v1. Prop translation across `<button>` ⇄ `<Button>` is genuinely ambiguous (event handlers, ref forwarding, class merging) — codemods deferred to v1.x.

Token import discovery recognizes three forms:

- ES named: `import { tokens } from '...'`
- ES default: `import tokens from '...'`
- CJS: `const tokens = require('...')`

### Phase 3: APPLY — Codemod or emit suggestion

For each finding classified as `safe-codemod`:

1. Read the source file (cached per-run to avoid re-reads when multiple findings hit the same file).
2. Locate the exact match position from the finding's `line` + `evidence.snippet`.
3. Compute the replacement using file-extension-aware syntax:
   - `.ts` / `.tsx` / `.js` / `.jsx` → `tokens.<dotted.path>`
   - `.css` / `.scss` → `var(--<dotted-path-as-kebab>)`
4. Replace in-place. Emit `FixOutcome.applied` with a structured diff (file / line / before / after).
5. If `--dry-run`: compute the diff but DO NOT write to disk.
6. If the file changed between detect-time and apply-time: skip with `kind: 'skipped-unsafe', reason: 'file changed since finding'`.

For each finding classified as `suggestion`: emit a human-readable description plus a preview of the suggested change. No file mutation.

### Phase 4: REPORT — Aggregate + (pipeline-mode) handoff writeback

1. Aggregate `FixOutcome[]` into a summary: counts by kind (applied / suggestion / skipped / failed) plus files modified and duration.
2. Build a `catalog` of finding codes that produced codemods and codes that produced suggestions.
3. In pipeline mode: write `pipeline.fixesApplied: FixOutcome[]` back to `.harness/handoff.json` so the orchestrator can re-verify only the affected findings on the next loop iteration.

## Harness Integration

- **`harness align-design-system`** — the CLI entry point. `--dry-run` for preview; `--write` is the default. Standard `--json` / `--verbose` / `--quiet` flags.
- **`harness align-design-system --mode pipeline`** — orchestrator-driven mode. Reads pre-classified findings from handoff.json; writes outcomes back.
- **`harness align-design-system --revert`** — inverse-applies the most-recent batch recorded at `.harness/align/last-batch.json`. Skips files edited externally since the apply (content-hash check). Idempotent: a second revert on the same batch is a no-op because the file no longer matches the recorded post-apply text.
- **`mcp__harness__align_design_system`** — MCP tool for agent consumption. Same input/output shape as the function call.
- **`detect-design-drift`** — soft dependency. Standalone mode invokes detect internally; pipeline mode trusts the orchestrator to have done it.
- **`harness check-design`** — composes detect (as 3rd verifier) into a single-pass design check. align is the matching FIX step; together they form the DETECT → FIX cycle that the (future) #5 orchestrator will loop.
- **`DesignConstraintAdapter`** — align does NOT write to the graph. The graph already tracks `VIOLATES_design` edges (the findings). Re-running detect after align shows the delta — no separate fix-edge needed.

## Success Criteria

See `docs/changes/design-pipeline/align-design-system/proposal.md` for the full 34 success criteria. Highlights:

- T001/T002/T003 codemods write to disk only when pre-flight classifier returns `safe-codemod`
- Codemods are idempotent — running twice produces zero additional changes on the second run
- Classifier downgrades to suggestion when token import is missing, when value appears in template/concatenation, or when multiple tokens share the value
- Classifier ALWAYS returns suggestion for T004 + all P\* findings (no source inspection)
- Pipeline mode reads `pipeline.driftFindings` from handoff.json; standalone mode runs detect internally
- Pipeline mode writes `pipeline.fixesApplied` back to handoff.json
- `--dry-run` produces identical `FixOutcome` shapes but never writes files
- Re-running detect after align produces strictly fewer T001/T002/T003 findings
- `--revert` re-applies the inverse of the most-recent `fixesApplied` batch; no-op when the file has been edited externally since the apply

## Examples

### Example: Apply a T001 codemod (hex → token reference)

**Input:**

`design-system/tokens.json` has:

```json
{ "color": { "brand": { "primary": { "$type": "color", "$value": "#0066cc" } } } }
```

`src/Card.tsx` has:

```ts
import { tokens } from '@/design-system/tokens';
const styles = { color: '#0066cc' }; // raw literal where token exists
```

**Output:**

```
src/Card.tsx
  ✓ DRIFT-T001:2 — Hex color "#0066cc" should use a token reference instead of a raw literal
     before: const styles = { color: "#0066cc" };
     after:  const styles = { color: tokens.color.brand.primary };

Summary: 1 applied, 0 suggestions, 0 skipped, 0 failed (1 files modified, 5ms)
```

### Example: Downgrade to suggestion (no token import)

Same finding as above, but `src/Card.tsx` does NOT import tokens. align emits a suggestion instead:

```
src/Card.tsx
  ? DRIFT-T001:2 — Hex color "#0066cc" should use a token reference instead of a raw literal

Summary: 0 applied, 1 suggestions, 0 skipped, 0 failed (0 files modified, 3ms)
```

(Run with `--verbose` to see the suggestion text and the classifier's reason for downgrading.)

### Example: Suggestion-only for DRIFT-P001

**Input:**

`design-system/DESIGN.md` registers `Button` in `## Component Registry`. `src/SaveButton.tsx` has:

```tsx
export const S = () => <button onClick={() => save()}>Save</button>;
```

**Output:**

```
src/SaveButton.tsx
  ? DRIFT-P001:1 — Raw <button> element where the registered component "Button" should be used

(use --verbose to see prop-translation suggestion)
```

v1 never auto-applies primitive adoption — prop translation across `<button>` ⇄ `<Button>` is the kind of judgment-call that benefits from a human or LLM review.

### Example: Revert the last batch

After a write run, the applied diffs (plus a SHA-256 of each post-apply file) are persisted to `.harness/align/last-batch.json`. Running `harness align-design-system --revert` reads that batch and inverse-applies each diff:

```
src/Card.tsx
  ✓ DRIFT-T001:2 — Hex color "#0066cc" should use a token reference instead of a raw literal
     before: const styles = { color: tokens.color.brand.primary };
     after:  const styles = { color: "#0066cc" };

Summary: 1 reverted, 0 suggestions, 0 skipped, 0 failed (1 files modified, 4ms)
```

If the file has been edited externally between apply and revert (the SHA-256 doesn't match), every entry for that file is skipped with `skipped-unsafe / reason: file changed externally since apply`. A second revert on the same batch is a no-op for the same reason — the file's post-revert content no longer matches the recorded post-apply text.

## Gates

- **No autofix without classifier approval.** Every codemod application goes through `classifyFinding`. If the classifier returns `suggestion`, NO file write occurs — even for the same finding code in the same file.
- **No autofix when token import is missing.** Adding the import line is its own ambiguity surface (alias? barrel? relative?). v1 skips with a suggestion.
- **No autofix for non-exact px matches.** "Round 13px to the nearest 16px" is a design decision the tool shouldn't make.
- **No autofix for primitive adoption.** v1 has no codemod for DRIFT-P\* — always suggestions.
- **No autofix in pipeline mode unless a `pipeline.driftFindings` field is present.** Empty handoff = empty run.
- **No graph writes.** align modifies source files; the graph is read-only from align's perspective.

## Escalation

- **When a T001 finding has multiple matching tokens (ambiguous):** the classifier downgrades to suggestion. To resolve, declare a primary token in DESIGN.md `## Token Primary Resolution Overrides` (v1.x), OR pick one in the source manually and re-run.
- **When the codemod corrupts a file (rare):** every application includes a structured diff. Recover via `git checkout <file>`. If the same input repeatedly corrupts, report the case — pre-flight classifier rules are conservative by design.
- **When pipeline-mode run finds no `pipeline.driftFindings` field:** align exits cleanly with empty outcomes. The orchestrator's contract is to write the field BEFORE invoking align.
- **When `--dry-run` shows fixes you don't want applied:** scope with `--files <glob>` to apply only specific files, or invoke align in pipeline mode with a curated `pipeline.fixBatch` list.
- **When you want to undo an apply:** run `harness align-design-system --revert`. It reads `.harness/align/last-batch.json`, content-hash-checks each file, and inverse-applies. Files edited since the apply are skipped (no silent corruption); recover via `git checkout <file>` if the content-hash check blocks revert and the prior commit is still in history.
- **When you want primitive-adoption fixes today:** apply the suggestion manually. The v1.x sub-project will add prop-translation tables + import resolution + revert-on-test-fail.
- **When align is invoked without detect having run first (standalone mode):** standalone mode runs detect internally — no manual ordering needed. Pipeline mode trusts the orchestrator to populate findings.

## Status

**v1 — in implementation.** See:

- Spec: `docs/changes/design-pipeline/align-design-system/proposal.md`
- Roadmap entry: `design-pipeline sub-project #1` (align half) in `docs/roadmap.md`
- Sibling: `detect-design-drift` (detect half — shipped PR #396)
