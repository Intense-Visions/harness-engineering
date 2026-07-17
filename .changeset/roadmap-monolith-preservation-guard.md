---
'@harness-engineering/core': patch
---

fix(roadmap): stop `manage_roadmap` write actions from destructively re-serializing a hand-authored monolith (#839)

In single-file mode, every `manage_roadmap` write (`promote`, `add`, `update`,
etc.) persisted through `MonolithStore.write()`, which unconditionally
re-serializes the whole `docs/roadmap.md` from a model that captures only a fixed
set of single-line fields. Any hand-authored content the model does not model was
silently discarded on the round-trip: multi-line `- **Summary:**` bodies
truncated to their first line, `- **Issue:**` links dropped, `>` blockquote
intros and HTML comments deleted. On a ~1100-line hand-maintained roadmap this
lost ~957 lines.

`MonolithStore.write()` now refuses rather than destroys: before overwriting it
scans the on-disk file with a new `findUnpreservedLines` guard and returns a
`write-failed` error (never writing) when the file carries content a whole-file
rewrite would drop, pointing the user to shard the roadmap (`docs/roadmap.d/`,
which does surgical per-row writes) or remove the unmodeled content. Cosmetic
normalizations the serializer legitimately makes — canonicalizing the H1 title to
`# Roadmap`, stripping `Milestone:`/`Feature:` heading prefixes, and bumping
frontmatter timestamps — are tolerated, so canonically-formatted and real-world
roadmaps still write normally. The sharded backend and aggregate regeneration are
unaffected; the guard is single-file-only.
