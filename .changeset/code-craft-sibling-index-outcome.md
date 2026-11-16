---
'@harness-engineering/cli': minor
---

`code-craft` now reports whether its clone index built, so "this codebase has no duplication" and
"the clone index never built" no longer look identical.

The index that feeds sibling evidence to the `abstraction-earns-keep` (CODE-R004) prompt used to
degrade to nothing on an `Err` and on an empty discovery and drop the reason. A run whose index
failed was byte-identical to a run over a codebase with no duplication. The outcome is now carried as
an additive `summary.siblingIndex` field on `CodeCraftOutput` (inline and `code_craft_finalize`), as
`siblingIndex` on the in-session `code_craft` collect response, and as one `Sibling evidence:` line
on the printed `harness code-craft` page:

- `{ status: 'built', classes, unitsWithSiblings }`: the class count, plus how many critiqued units
  in this run carried sibling evidence.
- `{ status: 'failed', reason }`: core's `details.reason` and message, or the thrown error's message.
- `{ status: 'empty', reason }`: discovery found no source files to index.
- `{ status: 'disabled', reason }`: the caller passed `siblings: false`.

The outcome is advisory, like the rest of craft. No status changes the exit code, and an index build
that throws now degrades the run instead of rejecting it.
