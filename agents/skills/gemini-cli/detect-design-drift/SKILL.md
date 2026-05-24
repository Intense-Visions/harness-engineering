# Detect Design Drift

> Detect design-system drift — hardcoded values where tokens exist, and raw HTML primitives where registered components exist. The rule-based floor of design-pipeline #1 (detect half). Reports findings; never modifies source. Pairs with a separate align-design-system fixer skill (deferred to a sibling sub-project).

## When to Use

- Reviewing a PR that touches UI code, when you want to catch divergence from the design system before it ships
- After adding a new design token, to surface places in the codebase that still use the hardcoded equivalent
- After registering a new primitive (e.g. Button) in DESIGN.md `## Component Registry`, to find existing raw-HTML usages that should adopt it
- As part of `harness validate` so drift surfaces continuously, not only on demand
- As one of three verifiers composed by `harness check-design` (alongside audit-component-anatomy and harness-design-craft)
- NOT for component-anatomy gaps (use audit-component-anatomy)
- NOT for aesthetic critique (use harness-design-craft)
- NOT for fixing drift — this skill detects only; the matching fixer (align-design-system) is a separate sub-project

## Process

### Phase 1: SCAN — Load resolvers + walk files

1. **Read project configuration.** Check `harness.config.json` for:
   - `design.strictness` — `strict` / `standard` / `permissive` (default `standard`)
   - `design.audit.driftDetection.enabled` — gate for the verifier (default `true`)
   - `design.audit.driftDetection.rules.{tokenBypass,primitiveAdoption}` — per-rule toggles
   - `design.audit.driftDetection.fastMode.maxFiles` — validate-time scope cap

2. **Load resolvers (soft-dependency — silent skip when absent):**
   - `design-system/tokens.json` (W3C DTCG format) — parsed by `loadTokenSet`. Extracts colors, font families, spacing scale, and deprecated token paths. Returns `null` when the file doesn't exist; token-bypass rules then skip silently.
   - `design-system/DESIGN.md` `## Component Registry` — parsed by `loadComponentRegistry`. Maps registered component types (Button/Input/Textarea/Link/Anchor) to their HTML primitive tag. Returns `null` when DESIGN.md or the section is absent; primitive-adoption rules then skip silently.

3. **Collect candidate files.** Walk the project root (or honor an explicit `files` arg from the caller). Skip `node_modules`, `dist`, `build`, `coverage`, and any dotfile directory. Honor only these extensions: `.ts`, `.tsx`, `.js`, `.jsx`, `.css`, `.scss`.

### Phase 2: APPLY RULES — Two rule families

1. **Token bypass rules (DRIFT-T\*) — regex-based detection.** For each file when tokens were loaded:
   - **DRIFT-T001** — Hex color literal (`#abc`, `#aabbcc`, etc.) NOT present in the loaded palette. Case-insensitive palette match. Deduplicated per `line:value`.
   - **DRIFT-T002** — Font-family string literal NOT present in the typography palette. System fallbacks (`sans-serif`, `serif`, `monospace`, `system-ui`, `inherit`) are always allowed.
   - **DRIFT-T003** — Pixel margin/padding/gap/positioning value NOT present in the spacing scale. Skipped entirely when no spacing tokens exist.
   - **DRIFT-T004** — Reference to a token flagged `$deprecated: true` (or `$extensions.harness.deprecated: true`) in tokens.json. Matched in both `'token.path.form'` and CSS-var kebab form (`--token-path-form`).

2. **Primitive adoption rules (DRIFT-P\*) — TS Compiler API JSX parsing.** For each `.jsx`/`.tsx` file when the registry was loaded:
   - **DRIFT-P001** — `<button>` JSX where `Button` is registered
   - **DRIFT-P002** — `<input>` JSX where `Input` is registered
   - **DRIFT-P003** — `<a>` JSX where `Link` or `Anchor` is registered
   - **DRIFT-P004** — `<textarea>` JSX where `Textarea` is registered
   - Lowercase JSX = HTML primitive (JSX semantics). Uppercase identifiers are skipped — they're already components. Member expressions (`<Foo.Bar>`) are skipped.

### Phase 3: REPORT — Severity, aggregate, persist

1. **Severity from `design.strictness`:**
   - `strict` — every finding `error` (CI blocks)
   - `standard` — DRIFT-T001/T002/P001 → `error`; everything else → `warn`
   - `permissive` — everything → `info`

2. **Aggregate the run summary.** `bySeverity`, `byCode`, `totalFiles`, `durationMs`. Also report `catalog.rulesApplied` (which rule families fired) and `meta.{tokensLoaded, registryLoaded, mode}` so callers can see what was active.

3. **Persist findings to the graph (when composed by check-design).** The check-design orchestrator passes drift findings to `DesignConstraintAdapter.recordFindings()` alongside anatomy and craft findings. Each finding becomes an idempotent `VIOLATES_design` edge keyed by `(file, code, line)` — re-runs do not double-write.

## Harness Integration

- **`harness validate`** — Fast-mode hook runs the detect-drift verifier. Findings respect `design.strictness`. Failures degrade gracefully: if the verifier throws, validate logs a warning and continues with other checks.
- **`harness check-design`** — One of three composed verifiers. The orchestrator aggregates findings across audit-anatomy, design-craft, and detect-drift; persists all three to the graph; and surfaces a unified report.
- **`mcp__harness__detect_drift`** — Programmatic API. Input: `{ path, mode, files?, designStrictness?, rules? }`. Output: `{ findings, summary, catalog, meta }`. Consumed by the design-pipeline orchestrator (sub-project #5).
- **`DesignConstraintAdapter.recordFindings()`** — Generic graph persistence entry point shipped in PR #390. Drift findings reuse the adapter; no extra graph plumbing.
- **Future align-design-system skill** — Separate sub-project. Reads the same finding codes (DRIFT-T\*, DRIFT-P\*) and applies fixes. Decoupling detect from align keeps each skill testable in isolation and lets the detect side ship first.

## Success Criteria

See `docs/changes/design-pipeline/detect-design-drift/proposal.md` for the full 34 success criteria. Highlights:

- Zero false positives when tokens.json/DESIGN.md are absent (rules skip silently — no speculative findings)
- Token-bypass detection runs in &lt; 1s on a 500-file repo (fast-mode budget)
- Primitive-adoption parses JSX correctly across multi-line / fragmented opening tags (TS Compiler API, not regex)
- Idempotent graph persistence — re-running produces zero duplicate edges
- `harness validate` runtime budget &lt; 3s on a 500-file repo with both rule families enabled
- Both rule families gated independently via config (a project can disable primitive-adoption without disabling token-bypass)

## Examples

### Example: Hardcoded brand color outside the palette

**Input:** `src/Card.tsx` contains `const styles = { color: "#ff0000" };`, and `design-system/tokens.json` defines `color.brand.primary` as `#0066cc` (but no `#ff0000`).

**Output:**

```
DRIFT-T001 [error] src/Card.tsx:14 — Hardcoded color "#ff0000" is not in the design token palette
  Fix: Replace "#ff0000" with a token reference (e.g. var(--color-...) or a token-system lookup).
       If the color is intentionally one-off, add it to tokens.json first.
```

Severity is `error` under `standard` because brand-color drift is high-impact.

### Example: Raw `<button>` where Button is registered

**Input:** `src/SaveButton.tsx` contains `<button onClick={...}>Save</button>`, and `design-system/DESIGN.md` `## Component Registry` lists `Button` mapped to `packages/ui/src/Button.tsx`.

**Output:**

```
DRIFT-P001 [error] src/SaveButton.tsx:8 — Raw <button> element where the registered component "Button" should be used
  Fix: Import Button from your component library and replace <button> with <Button>.
       If this raw primitive is intentional (e.g. inside the Button component's own implementation),
       add a JSDoc `@allow-raw-primitive` annotation on the file.
```

### Example: Reference to a deprecated token

**Input:** `src/legacy.css` contains `.x { color: var(--color-brand-500); }`, and `tokens.json` flags `color.brand.500` as `$deprecated: true` with `$description: "Use color.brand.primary instead"`.

**Output:**

```
DRIFT-T004 [warn] src/legacy.css:3 — Token "color.brand.500" is deprecated and should be migrated
  Fix: Migrate references to "color.brand.500" to the replacement token noted in tokens.json $description,
       or remove the deprecation if the token is still load-bearing.
```

## Gates

- **No findings without resolved inputs.** If `tokens.json` is absent, all T\* rules silently skip. If `DESIGN.md ## Component Registry` is absent, all P\* rules silently skip. Either resolver failing is not a verifier failure — the project simply hasn't opted in.
- **No autofix.** Findings include codemod-todo descriptions. The matching fixer (align-design-system) is a separate skill.
- **No usage-side primitive findings beyond the four registered tags.** Other tags (`<select>`, `<details>`, etc.) are not in scope for v1 — even if the project registers a component for them. Subsumption ships in v1.x.
- **Strictness from config, not assumed.** Read `design.strictness` from `harness.config.json`; default to `standard` if absent.

## Escalation

- **When token-bypass false positives appear in a third-party-shaped value.** E.g. a vendor color brought in via a CSS variable that legitimately doesn't match the palette. Either add the value to `tokens.json` (preferred — makes the palette authoritative) or scope the file via `design.audit.driftDetection.rules.tokenBypass: false` for a narrow path-overrides block (v1.x).
- **When primitive-adoption fires inside the Button component's own implementation.** That's a true positive that the rule can't tell apart from the usage form. Two paths: (1) add `@allow-raw-primitive` JSDoc on the file (v1.x — annotation honored by the rule), or (2) extract the raw `<button>` into a private internal component until the annotation lands.
- **When `harness validate` runtime exceeds 3 seconds.** Set `design.audit.driftDetection.fastMode.maxFiles` to cap the scope. The MCP tool ignores the cap (`fast`/`full` are equivalent in v1 — the cap is validate-side only).
- **When the graph persistence fails.** Skip graph integration for that run; findings still appear in the report. The graph is a consumer, not a gate.
- **When a project ships its own design-system convention (not tokens.json, not DESIGN.md registry).** v1 reads only the two declared input formats. Either (1) generate a tokens.json adapter that mirrors the existing convention (one-shot script), or (2) wait for v1.x's pluggable resolver interface.

## Status

**v1 — in implementation.** See:

- Spec: `docs/changes/design-pipeline/detect-design-drift/proposal.md`
- Roadmap entry: `design-pipeline sub-project #1` (detect half) in `docs/roadmap.md`
- Sibling: `align-design-system` (fix half — deferred to a separate sub-project)
