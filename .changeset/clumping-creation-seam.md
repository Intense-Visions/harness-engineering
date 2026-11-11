---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Wire clumping's creation seam (docs/changes/clumping/proposal.md, Phase 3), giving `formClumps` its first production callers.

**Craft — group at emission.** A shared adapter (`packages/cli/src/shared/craft/findings/clumpable.ts`) maps any craft family's finding to core's seam-neutral `ClumpableItem`: scope is the target file's directory, kind is the finding-code prefix, the conflict key is the target file, and weight is the existing `derivePriority`. All eleven craft orchestrators now emit `clumps` alongside `findings`. The family comes from `code`, never from `cite`, because design-craft declares `cite.rubricOrPatternId` where the other ten declare `cite.rubricId` — deriving a family from the citation would silently fold every design finding into one bogus group. A repository sweep has no touched set, so every sub-floor craft item resolves `'file'`; that is the spec's stated outcome and is now asserted so it cannot drift.

**Review — group the sub-floor comments.** After DEDUP+MERGE, `critical` and `important` findings keep their individual inline comments, because the line anchor is the whole value of one. `suggestion`-severity findings group into one comment per `(scope, kind)` that names every member with its file and line. The diff's changed files are the touched set, so the floor's `'act'` resolution is reachable at this seam. Every finding is represented in exactly one emitted comment: a group shed by the emitted-unit cap degrades back to individual comments rather than disappearing.

Also fixes a CWE-79 gap found while pinning that law: the grouped comment now escapes member titles through the same `sanitizeMarkdown` the individual comment path already used.
