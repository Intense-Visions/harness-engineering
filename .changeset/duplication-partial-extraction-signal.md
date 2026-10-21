---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Clone classes now carry a `partial-extraction` signal: a class is labelled when EVERY member's
unit BODY references a value binding imported from one common first-party module, and
`sharedImport` names that module by its repo-relative extensionless key. It is the half-done
extraction — the shared helper already exists and only the wrapper layer stayed duplicated —
which makes it the cheapest fix on the report, because the repair is delete-and-import rather
than design.

All four conditions in that predicate are load-bearing, and the reason is a measurement rather
than a preference. The obvious implementation — "every member's file imports a common module" —
labels **89 of this repository's 96 reported clone classes (92.7%)**, and labels them wrongly:
ten sibling files at equal directory depth share the STRING `../findings/schema.js` while naming
ten different files, so intersecting raw specifiers reports modules that are not shared at all.
It also labels all 38 platform-mirror classes by construction, since four copies of one file
have identical import lists — which would have put the mirror block at the head of the operator's
page. Keyed on module IDENTITY, scoped to the unit BODY, restricted to VALUE imports (excluded
per declaration AND per inline specifier) and to FIRST-PARTY modules, the same ladder lands at
**10 of 96, none of them a mirror**.

`CloneClass` gains a published `priority` field. **`rank` is unchanged** and remains exactly
`tokenCount * members.length`: it is the SIZE of the duplication and consumers read it as
"tokens x copies", so folding an ordering policy into it would make that arithmetic silently 2x
wrong for precisely the classes a consumer most wants to act on. `priority` is `rank` for a plain
duplicate and `rank * PARTIAL_EXTRACTION_PRIORITY_BOOST` (2) for a labelled one, and it is
published rather than kept private so a `--json` consumer handed a reordered list can reproduce
the order from the payload instead of taking it on trust.

**The `maxClasses` report cap is now by `priority` rather than by `rank`.** For any project with
no `partial-extraction` class the two are the same number for every class, so the reported set,
its order and the `classesTruncated` count are all byte-identical to before. A project that does
have labelled classes will see them ordered ahead of larger plain duplicates — on this repository
that moves one named class from position #21 to #9 and halves the structurally-concentrated rows
on the default printed page.

Both operator surfaces name the signal, because an order the output cannot explain is worse than
no reordering: `harness cleanup -t duplication` prints
`[partial-extraction -> <module key>]` on the rows that have one and publishes `signal`,
`sharedImport` and `priority` under `--json` (`sharedImport` is ABSENT, not
present-and-`undefined`, on a plain duplicate), and `detect_entropy`'s `advisory.duplication`
carries the same tag on its `topClasses` lines.

`sharedImport` is a module KEY, not a file path: it is derived without touching the filesystem,
so claiming a file exists would be a claim the derivation never checked. When a class shares more
than one module the lexicographically smallest key wins, so the published value never depends on
file-discovery order.

RIDE-ALONG, named so it is not mistaken for signal work: `detect_entropy`'s summary mode now
reports `advisory.duplication.filesSkipped`. Summary mode was the one duplication surface with no
skip counter, so a partial scan was indistinguishable from a complete one.
