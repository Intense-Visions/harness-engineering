---
'@harness-engineering/cli': minor
---

Add **security-craft** — tenth (and final) sub-project of the craft-pipeline initiative (#10 of 10; sixth non-design). The craft-pipeline initiative completes with this PR. LLM-judgment skill for security posture on TS/JS source — the ceiling counterpart to `harness-security-scan` (CVE/OWASP rule-based floor) and `harness-security-reviewer` (procedural review). Threat-modeling-as-skill rather than pattern-matching. Critiques whether trust boundaries are respected, where implicit privilege escalation lurks, whether the code defends in depth or just at the gate, whether principle of least authority is honored.

**Three decisions locked:**

1. **v1 scope: source code only (TS/JS).** Walks `packages/*/src/`. Excludes IaC, dependency manifests, CI configs (floor concerns covered by CVE scanners + image-scanning). Narrowest scope = highest signal-to-noise; matches the per-file pattern of knowledge-craft + copy-craft.
2. **AST-driven targeting.** Uses TS Compiler API to detect security signals in any file: HTTP handlers, middleware, auth APIs, `child_process`/`eval`/`new Function`, `fs` writes, JWT/session/cookie APIs, raw SQL queries, network egress, secret handling. **Files with zero signals are skipped entirely** — no path-heuristic fallback. AST awareness (not regex) avoids common FPs like `exec` in a comment or `eval` as a variable name.
3. **Conservative confidence default.** Rubric prompts bias the LLM toward `medium` confidence; `high` requires a specific, named anti-pattern or visible missing guard. Per ADR 0019, low/medium-confidence findings are de-emphasized in reports. Directly mitigates the roadmap's flagged FP risk for judgment-based security (which the roadmap called out as the hardest craft to land well).

**8 seed rubrics** (one file per rubric, each declaring `appliesToSignals` for pre-filter):

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

**7 signal kinds** detected via single-pass TS Compiler API walk:

- `http-handler` — `(req, res)` / `(req, res, next)` shapes; `app.get/post/...`; `@Get/@Post/...` decorators
- `middleware` — `(req, res, next) =>` / `(ctx, next) =>` shapes
- `auth-api` — `jwt.{sign,verify}`, `bcrypt.{hash,compare}`, `argon2.*`, `passport.*`, `req.session.*`, `res.cookie`
- `privileged-op` — `child_process.{exec,spawn,...}`, `eval`, `new Function`, `vm.runIn*`, `fs.{writeFile,unlink,chmod,...}`
- `data-egress` — `fetch`, `axios.*`, `http.request`, `https.request`, `net.connect`
- `raw-query` — `*.query/raw/$queryRaw/$executeRaw` with SQL-shaped template literal
- `secret-handling` — secret-named variable (`token`, `password`, `apiKey`, …) flowing into `console.*` / `logger.*` / `JSON.stringify` / template-literal sink

**Honors ADRs 0018-0021:** confidence first-class (and conservatively biased), 3-axis preserved (tier × impact × confidence), `cite.rubricId` on every finding for catalog usage signal, living-catalog H seed format.

**Cross-cutting API:** `critiqueSecurityInFile(file, opts)` exported. Returns `[]` for files with no security signals (consistent with the orchestrator's FP-management strategy). Mirrors the shape of `critiqueKnowledgeFile` / `critiqueCopyInFile` / `critiqueSpecFile` / `critiqueNameFile`.

**Surface area:**

- `harness security-craft` CLI command (`--files` / `--packages` / `--max-files` / `--max-signals-per-file` / `--json`)
- `security_craft` MCP tool (count 79 → 80)
- 4-platform skill markdown (claude-code / codex / cursor / gemini-cli)
- Plugin slash-commands generated for `.claude-plugin/` + `.cursor-plugin/`

**FP-management strategy** (three independent layers):

1. AST-driven signal detection — files with zero security-relevant constructs are skipped entirely; no broad-glob fallback.
2. Per-rubric `appliesToSignals` pre-filter — a file with one `secret-handling` signal only fires SEC-R007, not all 8 rubrics.
3. Conservative-confidence system prompt — LLM defaults to `medium` confidence; `high` requires a specific, named anti-pattern.

**Tests:** 45 new tests (8 discover + 21 signals + 5 critique + 11 integration) covering: AST awareness (comments/variable-name "eval" don't fire), every signal kind, per-rubric pre-filter, conservative-confidence contract, cross-cutting API returns `[]` for no-signal files. 167 sibling craft tests (naming/spec/copy/test/design/knowledge) still pass after the new module imports `shared/craft`.

**craft-pipeline initiative completes** with this PR. 10 sub-projects shipped across naming-craft (#1), spec-craft (#6), copy-craft (#5), test-craft (#3), knowledge-craft (#9), security-craft (#10), and the design-pipeline-side craft skills (design-craft + the 4 design-pipeline siblings).

**Long-term trajectory:**

- v1.x: IaC critique with dedicated rubrics (Dockerfile USER, k8s securityContext, Terraform IAM); multi-file auth-flow tracing (handler → middleware → service via graph); `align-security` sibling FIX skill (aggressive FP safeguards); test-file security critique; `craft.security.confidenceFloor` runtime config; framework expansions (tRPC, Convex, Cloudflare Workers, Hono RPC).
- v2: composes with `harness-security-scan` at scan time — CVE findings carry a security-craft "shape" rubric for context.
- v3: assumed-adversary-as-config — project declares its threat model and rubrics critique against the declared model rather than inferring.
