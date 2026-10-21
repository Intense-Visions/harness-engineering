---
'@harness-engineering/core': minor
'@harness-engineering/cli': minor
---

Clone classes now carry a `partial-extraction` signal: a class is labelled when EVERY member's
unit BODY **calls into** one common first-party module, and `sharedImport` names that module by
its repo-relative extensionless key. It is the half-done extraction — the members already call
into a shared module and only the wrapper layer stayed duplicated — which usually makes it the
cheapest fix on the report, because the repair is bounded by a module that already exists rather
than by a design question.

The label means the members share a CALLED module. It does **not** claim the duplicated wrapper
already lives there, so it is **not necessarily a delete-and-import**: open the module named by
`sharedImport` and confirm what it exports before planning the repair. On this repository the
duplicated wrapper is among the named module's exports in **0 of the 7** labelled classes — even
`parseFencedJson`, whose module exports `extractFencedJsonPayload` and not the wrapper. That the
wrapper was never extracted is the finding itself. Where it is absent, the repair is "extract
into that module": cheaper than greenfield, but not a delete.

"Calls into" is literal. The binding must appear in every member body as a call callee
(`extract(x)`, `new Formatter(m)`), a method-call receiver (`fmt.format(x)`) or a JSX element
name (`<Row />`). Merely REFERENCING a name the module exports does not qualify, and that
distinction is not stylistic: an earlier revision of this work matched identifier TOKENS by
spelling and labelled three classes whose `sharedImport` pointed at a module exporting no such
helper at all — every member body merely mentioned a constant that module exports. The row
promised a delete-and-import repair with nothing to import. The role filter also excludes, by
construction, a member property spelled like the import (`item.extract()`), a non-computed
object or property key (`{ extract: item }`, `class A { extract() {} }`) and a value import used
only as a type (`mode: OutputModeType`). A local binding that SHADOWS the import is handled
conservatively — a name also declared in the file is dropped — so the residual is a false
negative, never a false positive.

Every condition in that predicate is load-bearing, and the reason is a measurement rather than a
preference. The obvious implementation — "every member's file imports a common module" — labels
**89 of this repository's 96 reported clone classes (92.7%)**, and labels them wrongly: ten
sibling files at equal directory depth share the STRING `../findings/schema.js` while naming ten
different files, so intersecting raw specifiers reports modules that are not shared at all. It
also labels all 38 platform-mirror classes by construction, since four copies of one file have
identical import lists — which would have put the mirror block at the head of the operator's
page. Keyed on module IDENTITY, scoped to the unit BODY, restricted to VALUE imports (excluded
per declaration AND per inline specifier) and to FIRST-PARTY modules, and to a CALL position,
the same ladder lands at **7 of 96, none of them a mirror**.

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
that moves one named class from position #21 to #8 and halves the structurally-concentrated rows
on the default printed page (4 of 10 to 2 of 10).

Within a priority TIE the ordering decision holds on its own: `signal` is a comparator term
ahead of `fingerprint`, so a labelled class leads. The boost makes a labelled class of rank r tie
a plain class of rank 2r, and that tie was previously resolved by sha1 hex — which put the
labelled class below plain ones as often as not. It was live on this repository under the looser
predicate (three plain classes and one labelled class all at priority 432, the labelled one
last); under the shipped predicate no such tie is live here, which is exactly why the term
matters for the next project rather than for this page.

Both operator surfaces name the signal, because an order the output cannot explain is worse than
no reordering: `harness cleanup -t duplication` prints
`[partial-extraction -> <module key>]` on the rows that have one and publishes `signal`,
`sharedImport` and `priority` under `--json` (`sharedImport` is ABSENT, not
present-and-`undefined`, on a plain duplicate), and `detect_entropy`'s `advisory.duplication`
carries the same tag on its `topClasses` lines.

Both surfaces are also actionable about SCALE, because a row names one site while the job is
collapsing all of them: every printed row and every `topClasses` line now reads
`unit (file:line, +N more sites)`, both publish a labelled-class count (`N labelled
partial-extraction` on the CLI advisory line, `labelledClasses` on `advisory.duplication`), and
the CLI adds a `largest by rank` footer when the priority ordering pushed the biggest class off
the printed rows.

**Interface note for PRODUCERS.** `priority` and `importKeys` are REQUIRED fields added to
published types — `priority` on `CloneClass`, `importKeys` on the `FingerprintedUnit` that
`fingerprintFile` returns. Every consumer of these types is unaffected (a reader gains fields),
but any external code that CONSTRUCTS a `CloneClass` or a `FingerprintedUnit` — a test double, a
fixture factory, a mock analyzer — stops typechecking until it supplies them. That is the whole
breaking surface of this release for the core package.

`sharedImport` is a module KEY, not a file path: it is derived without touching the filesystem,
so claiming a file exists would be a claim the derivation never checked. When a class shares more
than one module the lexicographically smallest key wins, so the published value never depends on
file-discovery order.

RIDE-ALONG, named so it is not mistaken for signal work: `detect_entropy`'s summary mode now
reports `advisory.duplication.filesSkipped`. Summary mode was the one duplication surface with no
skip counter, so a partial scan was indistinguishable from a complete one.
