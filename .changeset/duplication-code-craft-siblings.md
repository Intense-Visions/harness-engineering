---
'@harness-engineering/cli': minor
---

code-craft: give CODE-R004 the cross-file evidence its own text demands

`abstraction-earns-keep` (CODE-R004) names the Rule of Three verbatim — "the same five lines copied
in three places crying out for one named home" — while the critique prompt carried ONE unit's source
span and no cross-file channel. Asking a model whether five lines appear in three places while
showing it one place is not a hard judgment call, it is an impossible one.

Each critiqued unit is now resolved against `CloneIndex.byMember`, and the CODE-R004 prompt carries
the sibling `file:line` locations, the shared normalized token count, and — for a
`partial-extraction` class — the `sharedImport` module key.

**Default ON.** Cost: one clone index per `code-craft` run, **2.1-2.9 s measured over this
repository's 2,066 discovered source files** (four runs: 2894 / 2386 / 2142 / 2075 ms), against a
run that makes up to 100 LLM calls. `siblings: false` on the programmatic input opts out. **No CLI
flag and no MCP schema change**, so the generated reference docs are untouched.

**Incidence, with its denominator: 153 of 7,880** substantive units at that scope (1.94%) belong to
a clone class, **16** of them to a `partial-extraction` class. Since `maxFiles` defaults to 100, a
typical run attaches siblings to single digits of units. The feature is quiet by design — that is
the measured rate of whole-unit Type-2 clones among substantive units, not a wiring defect. Anyone
judging it by "how often did it fire" needs that denominator.

**Scoped to CODE-R004.** `code-craft` sends one prompt per (unit, rubric) pair and 7 seed rubrics
apply to a function, so rendering for all 7 would cost 7x the tokens for six rubrics with no clause
that can use the evidence. The other six rubrics' prompts are byte-identical, and so is every prompt
for a unit with no siblings — both anchored on literals captured against unmodified sources before
the change.

**The `partial-extraction` wording holds Phase 4's corrected promise:** the copies share a CALLED
module, which is not the same claim as the wrapper already living there. The block tells the reader
to open that module and confirm what it exports.

**The matcher never consults `kind`.** The two unit extractors disagree there for 139 of 7,880 units
(1.76%) — all `code-craft` `method` vs estree `function` for an object-literal property function or
arrow — so matching on `(file, kind, startLine)` would have silently dropped 1.76% of lookups.
Matching is on `(file, startLine)`, exact key first then ±1 then ±2, with every candidate gated by
an `endLine` span co-check.

**What it does not do:**

- Nothing surfaces sibling incidence in the run summary, so a failed index build is **invisible to
  an operator** — the run completes normally with no evidence attached. Filed as a follow-up; it
  changes `CodeCraftOutput`, the MCP response and the printed page.
- `critiqueCodeInFile` does not auto-build an index. Pass `cloneIndex` and `projectRoot` to get
  sibling evidence from that entry point.
- `DEFAULT_DUPLICATION_CONFIG` is hard-wired; `harness.config.json`'s `analyze.duplication` block is
  not read, so an adopter who tunes the detector will not see `code-craft` follow.
