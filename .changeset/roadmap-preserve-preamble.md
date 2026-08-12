---
'@harness-engineering/types': minor
'@harness-engineering/core': minor
---

Preserve the roadmap's preamble — the block between `# Roadmap` and the first
milestone heading — through `shard` → `regen`.

That block is where a roadmap carries instructions to the tooling and humans
downstream of it: a `<!-- markdownlint-disable-file MD013 -->` directive that
keeps a required docs-lint check green against a schema that mandates one
physical line per field, and the note recording why the file is formatter-exempt
and must not be reflowed. It entered neither `_meta.md` nor any shard, so `regen`
faithfully rebuilt an aggregate the block had never been part of and it was gone
— at exit code 0, with nothing warning. The tooling erased the note documenting
its own contract, and erased it silently (#1328).

`Roadmap` gains an optional `preamble`, captured verbatim by `parseRoadmap` and
re-emitted by `serializeRoadmap` under the title — the same
never-silently-drop-it contract the narrative `### Group:` sections already have.
`RoadmapMeta` carries it in the `_meta.md` body ahead of any
`## Assignment History` section, because it is roadmap-level and not derivable
from shards, exactly like the assignment history. It therefore also survives the
`_meta.md` rewrites of `stampLastSynced` and `patchAssignmentHistory`, and the
`shard` command's pre-write round-trip assertion now covers it: dropping it is a
detected failure that aborts the migration rather than a silent strip.

The field is attached only when a roadmap actually has a preamble, so a
preamble-free roadmap parses to the same shape and serializes to the same bytes
as before, and `_meta.md` is byte-identical for every existing shard directory.
The H1 title line is not part of the preamble (the serializer still canonicalizes
it to `# Roadmap`); content authored above the title is kept and re-emitted below
it, so a second parse of the serialized form returns the same string and regen
stays byte-stable.

Scope is deliberately the preamble only. Everything after the first `##` heading
— continuation lines of a wrapped field, unmodeled `- **Key:**` bullets,
section-intro blockquotes — is still unmodeled and still lost on a rewrite; the
`findUnpreservedLines` guard continues to report it and `MonolithStore` continues
to refuse those writes. What changes there is that the guard no longer reports
preamble lines, which the serializer now keeps: it was blocking single-file
roadmap writes over content that is no longer at risk.
