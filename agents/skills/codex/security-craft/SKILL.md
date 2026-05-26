# Security Craft

> LLM-judgment critique of security posture for TS/JS source — the ceiling counterpart to `harness-security-scan` (CVE/OWASP rule-based floor) and `harness-security-reviewer` (procedural review). Threat-modeling-as-skill rather than pattern-matching. Critiques whether trust boundaries are respected, where implicit privilege escalation lurks, whether the code defends in depth or just at the gate, whether principle of least authority is honored. Sixth non-design member of the craft-pipeline initiative (#10 of 10; the final sub-project). Emits 3-axis findings (tier × impact × confidence per ADR 0019).

## When to Use

- During PR review on a substantively-changed handler / middleware / privileged op
- After authoring a new endpoint, before exposing it to traffic
- When onboarding a new contributor (audit security-relevant code they introduced)
- Periodically (per-sprint or per-release) to catch security-shape drift
- For threat-modeling shape questions a CVE scanner doesn't address (trust boundaries, fail-closed, authz ordering)
- NOT for CVE / dependency scanning (use `harness-security-scan` — rule-based floor)
- NOT for procedural review checklists (use `harness-security-reviewer`)
- NOT for IaC critique (v1.x — Dockerfile / k8s / Terraform have different rubric vocabulary)
- NOT for secret detection (floor concern; existing regex/entropy scanners cover this)
- NOT for autofix / security rewriting (this is judgment-only; v1.x may add `align-security` with aggressive safeguards)
- NOT for test files (v1 excludes — test security has a different shape; v1.x with dedicated rubrics)

## Process

### Phase 1: DISCOVER — Find source files

1. Walk `packages/*/src/` recursively.
2. Include `*.{ts,tsx,js,jsx,mjs,cjs}`; exclude test files (`*.test.*`, `*.spec.*`, `tests/`, `__tests__/`).
3. Exclude generated / build / coverage dirs (`node_modules`, `dist`, `build`, `coverage`, `.next`, `.turbo`, `__snapshots__`).
4. Honor `--packages` for explicit package scoping; `--files` overrides discovery.

### Phase 2: SIGNAL — AST-driven security construct detection

For each source file, the TS Compiler API walks the AST once and emits `SecuritySignal`s. Files with zero signals are **skipped entirely** — this is the FP-management strategy from the spec (no path-heuristic fallback).

Detected signal kinds:

| Kind              | What it matches                                                                                                                        |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `http-handler`    | `(req, res)` / `(req, res, next)` shapes; `app.get/post/...`; `@Get/@Post/...`                                                         |
| `middleware`      | `(req, res, next) =>` arrow / `(ctx, next)` shapes                                                                                     |
| `auth-api`        | `jwt.{sign,verify}`, `bcrypt.{hash,compare}`, `argon2.*`, `passport.*`, `req.session.*`, `res.cookie`                                  |
| `privileged-op`   | `child_process.{exec,spawn,...}`, `eval`, `new Function`, `vm.runIn*`, `fs.{writeFile,unlink,chmod,...}`                               |
| `data-egress`     | `fetch`, `axios.*`, `http.request`, `https.request`, `net.connect`                                                                     |
| `raw-query`       | `*.query(\`...${x}...\`)`, `*.raw(...)`, `$queryRaw`, `$executeRaw` with SQL-shaped argument                                           |
| `secret-handling` | Secret-named variable (`token`, `password`, `apiKey`, …) flowing into `console.*`, `logger.*`, `JSON.stringify`, template-literal sink |

AST awareness (not regex) avoids common false positives: `exec` in a comment, `eval` as a variable name, `token` in a CSS property name.

### Phase 3: CRITIQUE — Per (file, signal, rubric) loop

8 seed rubrics, each declaring `appliesToSignals` so per-signal pre-filtering minimizes LLM cost:

| Rubric     | Title                                           | Applies to signals                                  |
| ---------- | ----------------------------------------------- | --------------------------------------------------- |
| `SEC-R001` | Trust boundary respected                        | http-handler, middleware, raw-query, privileged-op  |
| `SEC-R002` | Principle of least authority honored            | auth-api, privileged-op, http-handler               |
| `SEC-R003` | Defense in depth (not gate-only)                | auth-api, http-handler                              |
| `SEC-R004` | Assumed adversary realistic for the deployment  | http-handler, middleware, auth-api                  |
| `SEC-R005` | Data flow across trust boundaries is visible    | http-handler, raw-query, data-egress, privileged-op |
| `SEC-R006` | Fail closed, not open                           | auth-api, middleware, http-handler                  |
| `SEC-R007` | Secrets carried in a shape that resists leakage | secret-handling                                     |
| `SEC-R008` | Authorization check happens before the action   | http-handler, privileged-op                         |

For each (signal, rubric) pair where the rubric applies:

1. Build a prompt with rubric description + file path + signal info + **1500-char window AROUND the signal line** (not the whole file — security-critical context is local).
2. **Conservative-confidence system prompt** biases the LLM toward `medium` confidence by default; `high` requires a specific, named anti-pattern or visible missing guard.
3. LLM returns fenced JSON: `null` (rubric doesn't apply / code is fine) OR `{ tier, impact, confidence, message }`.
4. On non-null: emit a `SecurityFinding` with `cite.rubricId` populated for ADR 0020 traceability.

### Phase 4: REPORT — Aggregate + cost telemetry

Emit `SecurityCraftOutput`:

```ts
{
  findings: SecurityFinding[];
  summary: {
    phaseRun: ['critique'];
    mode: 'fast';
    durationMs: number;
    llmCalls: { provider, model, count, costUsd };
    catalog: { rubricsApplied: string[] };
    counts: { filesScanned, filesSkippedNoSignal, signalsDetected };
    runId: string;
  }
}
```

`filesSkippedNoSignal` is tracked separately so report consumers can see how aggressively the AST pre-filter trimmed the corpus.

## Harness Integration

- **`harness security-craft`** — CLI entry. `--files <glob>` / `--packages <names>` / `--max-files <n>` / `--max-signals-per-file <n>` / `--json` / `--verbose`.
- **`mcp__harness__security_craft`** — MCP tool. Same input/output. Consumed by agents.
- **Cross-cutting API:** `critiqueSecurityInFile(file, opts)` exported from `packages/cli/src/security-craft/index.ts`. Returns `[]` for files with no security signals (consistent with the orchestrator's FP-management strategy).
- **Shared craft infrastructure:** `LlmProvider`, `MockLlmProvider`, `derivePriority`, 3-axis types all live in `packages/cli/src/shared/craft/`.

## Success Criteria

See `docs/changes/craft-pipeline/security-craft/proposal.md` for the full 29 success criteria. Highlights:

- 8 seed rubrics ship at `catalog/rubrics/<id>.ts` (file-per-rubric)
- AST detector emits signals for all 7 signal kinds; comment / string contents don't fire (AST-aware, not regex)
- Files with zero signals are skipped (`filesSkippedNoSignal` tracked)
- Per-rubric `appliesToSignals` pre-filter avoids irrelevant LLM calls
- 3-axis output preserved; confidence defaults to medium per the spec's Decision #3
- `cite.rubricId` populated on every finding (ADR 0020)
- `critiqueSecurityInFile` cross-cutting API works on a single file

## Examples

### Example: User input flowing into child_process

**Input:** `packages/api/src/handlers/run-script.ts`:

```ts
import { exec } from 'child_process';
import type { Request, Response } from 'express';

export function runScript(req: Request, res: Response): void {
  const userScript = req.body.script;
  exec(`bash -c "${userScript}"`, (err, stdout) => {
    res.json({ output: stdout });
  });
}
```

**Output (mock LLM):**

```
SEC-R001 [foundational/large/high] child_process.exec:5
  User-controlled `req.body.script` flows directly into `bash -c "${userScript}"`.
  This is a textbook command-injection sink. Either reject the entire pattern
  (no user-supplied shell strings) or move to `execFile` with an allowlist of
  binaries and pre-validated arg arrays. Never templated into a shell.
SEC-R005 [foundational/large/high] child_process.exec:5
  Untrusted input (`req.body.script`) crosses the trust boundary into a
  privileged sink without any visible validation or escaping step. The crossing
  is invisible — the variable is named generically and goes straight to exec.
```

### Example: Auth check after action

**Input:** `packages/api/src/handlers/get-doc.ts`:

```ts
export async function getDoc(req: Request, res: Response) {
  const doc = await db.docs.findOne({ id: req.params.id });
  if (doc.ownerId !== req.user.id) return res.status(403).send();
  return res.json(doc);
}
```

**Output:**

```
SEC-R008 [foundational/medium/medium] req,res:1
  The document is loaded BEFORE the authorization check. Even though the
  response is denied, the load has already executed — observable side effects
  (audit logs, rate-limit counters, cache populations) leak existence
  information about documents the caller can't access. Authorize against the
  identifier first (`req.params.id` + `req.user.id`), then load.
```

### Example: File with no security signals

**Input:** A pure utility file with no http/auth/exec/fs/network constructs.

**Output:**

```
No security findings.

Summary: 0 findings across 0 files (12 skipped, 0 signals, 8 rubrics, 0 LLM calls, $0.0000, 4ms)
```

The 12 files were scanned for signals but skipped because none had security-relevant AST constructs — exactly the FP-management strategy at work.

## Gates

- **No autofix.** Sibling `align-security` deferred to v2 with aggressive FP safeguards (security rewrites have asymmetric downside).
- **No IaC critique.** Dockerfile / k8s / Terraform need different rubrics; v1.x.
- **No multi-file auth-flow tracing.** Cross-file privilege-escalation analysis (handler → middleware → service) needs a graph traversal layer; v1.x once cross-file critique pays for itself elsewhere.
- **No dependency / CVE scanning.** `harness-security-scan` is the floor.
- **No secret detection** (floor concern).
- **No test-file critique.** Test security has a different shape; v1.x.
- **No path-heuristic fallback.** If AST scan finds zero signals, the file is skipped. Tight scoping is part of the FP-management strategy.
- **No B' bootstrap.**

## Escalation

- **When LLM cost is too high:** drop `maxFiles` to 50 or `maxSignalsPerFile` to 5, or scope explicitly with `--packages <name>`. Per-file cost = (signals × applicable rubrics × per-call); typical handler fires ~3-5 rubrics, not 8.
- **When a specific rubric produces false positives:** v1 has no per-rubric disable; v1.x adds `craft.security.disabledRubrics: ['SEC-R004']`. Until then: filter findings by `cite.rubricId` downstream.
- **When the AST detector misses a framework you use** (tRPC, Convex, Cloudflare Workers, Hono RPC): v1 ships baseline coverage for Express / Hono / Fastify / Koa / NestJS-decorator. Adding a framework is a 1-line config in `signals.ts`. Track as v1.x.
- **When findings are too cautious (confidence floor):** the conservative-by-default is deliberate (FP management); v1.x adds `craft.security.confidenceFloor` to tighten further. Loosening below medium is intentionally not exposed.
- **When you want IaC critique:** v1.x. For v1, scope explicitly to source files and accept the gap.
- **When a finding is wrong:** dismiss it in your consumer; signal as a `suppressedAt` entry on the rubric for future catalog evolution.

## Status

**v1 — in implementation.** See:

- Spec: `docs/changes/craft-pipeline/security-craft/proposal.md`
- Roadmap entry: `craft-pipeline sub-project #10` (the final sub-project; the craft-pipeline initiative completes with this PR)
- Sibling craft skills: `naming-craft` (#1), `spec-craft` (#6), `copy-craft` (#5), `test-craft` (#3), `knowledge-craft` (#9), `harness-design-craft` (design-pipeline #6)
- Shared infrastructure: `packages/cli/src/shared/craft/`
- Future: `align-security` (FIX side; aggressive safeguards), IaC critique, multi-file auth-flow tracing, test-file security, framework expansions (tRPC / Convex / Cloudflare Workers / Hono RPC).
