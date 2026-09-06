---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Make `parseAssignmentHistory` distinguish "no `## Assignment History` heading" from "heading present, record-shaped content, zero records parsed". It returned `Ok([])` for both, and because `serializeRoadmap` omits the section when the record list is empty, an unreadable history and an absent history produced byte-identical output — so `harness roadmap regen` deleted the whole section at exit 0 with a success banner.

`minor`, not `patch`: a public call that previously succeeded now returns `Err`. A caller holding a document whose history section this build cannot read changes behaviour without changing code, so the bump has to be visible even though no signature moved. Concretely: a legacy pipe table missing its `|---|---|---|---|` separator row used to read as an empty history and now reports an error.

The guard is deliberately narrow. It fires only when the section holds lines shaped like records — `- **` bullets or `|` table rows, the only two shapes history has ever been written in. Prose placeholders, HTML comments, thematic breaks, a fenced example that demonstrates the grammar, and a section that follows the history all keep parsing as an empty history; the section is now bounded by the next heading of any level, not just the next `## `.

Adds a recovery hatch, because the refusal fails reads as well as writes and would otherwise wedge every shard-touching commit — including the commit that repairs the file. `harness roadmap regen --allow-unreadable-history` (or `HARNESS_ROADMAP_ALLOW_UNREADABLE_HISTORY=1`, which reaches the bare invocation the pre-commit hook runs) regenerates the aggregate while carrying the unreadable section through verbatim. It is lossless, so it cannot reintroduce the deletion the guard exists to stop.

Also closes a wider silent overwrite the new `Err` arm made reachable: `manage_roadmap`'s groom action swallowed both a read failure and a parse failure on `docs/roadmap-archive.md`, fabricated an empty archive and wrote it over the file, replacing every previously shipped row. Only a missing file now starts a fresh archive; a read or parse failure refuses, writes nothing, and leaves the live roadmap untouched.
