---
'@harness-engineering/orchestrator': patch
---

fix(orchestrator): durably suppress the self-referential SEC-INJ-001 FP in config-scanner

The `harness` CI check (`ci check --skip arch`) has been red on main because the
security scanner flags `config-scanner.ts`'s OWN documentation — a JSDoc comment that
names `eval(` while explaining the SEC-INJ-001 rule the scanner downgrades. It's a
self-referential false positive that prior commits kept dodging by rewording the
comment (whack-a-mole: each reword changes the finding hash → "new" finding → fails
again). Replace the reword with the sanctioned, durable `// harness-ignore SEC-INJ-001`
inline suppression (same pattern `injection-patterns.ts` uses for its own detector),
so the finding stays acknowledged permanently. This greens the `harness` CI job.
