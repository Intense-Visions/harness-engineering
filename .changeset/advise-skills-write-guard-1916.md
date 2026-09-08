---
'@harness-engineering/cli': patch
---

fix(cli): give `advise-skills` a `--dry-run` and stop hiding that it writes SKILLS.md

`harness advise-skills` presented as a query — "Content-based skill recommendations
for a spec", flags `--spec-path`, `--thorough`, `--top` — and then wrote `SKILLS.md`
into the user's spec directory on every single invocation. Nothing in the name, the
description, or any flag said so, no flag could suppress it, and a hand-edited
`SKILLS.md` was clobbered with no warning: the only acknowledgement was a
`Written to <path>` line printed after the fact.

Generating `SKILLS.md` is genuinely this advisor's job — `harness-planning` runs it
inline to produce that file, and the `advise_skills` MCP tool returns the resulting
`skillsPath` — so the write stays ON by default. What changes is that it is now
declared, guarded, and previewable:

- `--dry-run` computes and prints the recommendations, writes nothing, and still
  reports the path it would have used and whether that would create or overwrite.
- The command description names the write, so `--help` states the contract.
- Human output distinguishes `Written to` from `Overwrote existing`, ending the
  silent clobber.

Also corrects `advise_skills` in the MCP capability register from `['read']` to
`['read', 'write']`. That file is the data behind `harness mcp list-capabilities`,
the adopter's "what can an agent do through this server?" audit surface, and it was
reporting a tool that calls `writeFileSync` as observation-only. Reporting-only data;
nothing authorizes against it, so no behavior changes.

The MCP tool is untouched and byte-identical in behavior: it still writes and still
returns a real `skillsPath`.
