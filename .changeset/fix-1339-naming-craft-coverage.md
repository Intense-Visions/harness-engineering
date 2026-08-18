---
'@harness-engineering/cli': patch
---

fix(naming-craft): reconcile finalize coverage against the collected prompt set (#1339)

`finalizeNamingCraft` previously accepted a `responses` array covering only a
fraction of the prompts the paired collect call produced and still emitted a
normal-looking `NamingCraftOutput` whose summary read as a completed critique
of the whole scope — a false-green. It now reconciles `responses` against the
persisted prompt set: a materially short response set is rejected loudly
(mirroring the two-step-flow guard) unless the caller passes `allowPartial:true`.
The summary gains an explicit `coverage: { promptsAnswered, promptsTotal }`, and
on a partial finalize `filesScanned` narrows to only the files actually
critiqued so it never implies reach over unjudged files.
