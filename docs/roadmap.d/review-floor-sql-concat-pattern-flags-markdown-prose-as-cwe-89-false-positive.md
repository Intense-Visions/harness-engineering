---
slug: "review-floor-sql-concat-pattern-flags-markdown-prose-as-cwe-89-false-positive"
milestone: "Maintenance: Lint & Deps"
order: 6
---

### review floor: SQL_CONCAT_PATTERN flags markdown prose as CWE-89 (false positive)

- **Status:** done
- **Spec:** —
- **Summary:** Summary The security floor reviewer's SQL-injection detector (`SQL_CONCAT_PATTERN` in `packages/core/src/review/agents/security-agent.ts:28`) matches **plain prose**, not just code. It fires `critical` "Potential SQL injection via string concatenation (CWE-89)" findings on markdown skill docs that contain no SQL at all. Because `required-review` blocks on `critical` findings and the floor tier runs without LLM adjudication when `ANTHROPIC_API_KEY` is absent (e.g. some CI runs), a single prose false positive hard-blocks a PR. Reproduction PR #656 (skill prose edits) failed `required-review` with 5 blocking findings, all the same false positive. The trigger was a **pre-existing** heading in `harness-integration` SKILL.md: The pattern: matches `UPDATE ... + large` — a SQL keyword followed anywhere on the line by `+ <word>`. SQL keywords like `UPDATE`/`CREATE`/`DELETE` are common English/markdown words, so any heading or sentence such as "UPDATE (medium + large tiers)", "CREATE or DELETE + re-run", etc. trips it. The finding only surfaces when the floor reviewer scans a changed file, so it lies dormant until any PR happens to touch the file — then blocks that unrelated PR. (Worked around in #656 by rewording the heading `+` → `and`. That's per-file whack-a-mole, not a fix.) Why it's wrong - The detector runs line-by-line over the **entire content of changed files**, including markdown/prose, comments, and docs — not just code. - The first alternative has no requirement that the `+` is adjacent to a string literal or that the SQL keyword is in a query context. `KEYWORD ... + word` anywhere on the line is enough. - Severity is `critical` and blocks `required-review`, so a prose match is maximally disruptive. Proposed fix (options) 1. **Restrict to code contexts.** Skip non-code files (`.md`, `.txt`, `.toml` command renders, prose blocks) and/or only run within fenced code blocks for doc files. 2. **Tighten the regex** so the `+` must be adjacent to a string literal / template boundary (e.g. require a quote or backtick near the concatenation), reducing matches on `KEYWORD ... (a + b)` arithmetic-style prose. 3. **Require a string-literal SQL context** (a quoted string containing the keyword) before flagging concatenation, rather than a bare keyword token. 4. At minimum, **downgrade prose-only matches below the blocking threshold** so they comment rather than request-changes. Acceptance - A markdown heading like `UPDATE (medium + large tiers)` produces **no** `critical` finding. - A genuine `db.query("SELECT * FROM users WHERE id = " + userId)` still flags CWE-89. - Regression test covering both cases in the security-agent suite. Detector: `packages/core/src/review/agents/security-agent.ts:28` (`SQL_CONCAT_PATTERN`), emitted at `:85-101`.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** —
- **External-ID:** github:Intense-Visions/harness-engineering#657
