---
'@harness-engineering/core': minor
---

fix(core): stop losing assignment-history records whose feature name contains a pipe

The roadmap's `## Assignment History` section was emitted as a markdown pipe table and
read back by recovering its four values POSITIONALLY from an unescaped `split('|')`.
Nothing escaped the separator, and a feature name is free text (an H3 heading, or the
MCP `manage_roadmap` write path). So a name such as `Auth | Login flow` serialized to a
row with five cells, `action` landed on the wrong cell, failed its membership check, and
the WHOLE record was dropped on the next read — silently, with no error and no warning
(#1811).

The column separator is now gone rather than escaped. Each record is written as a block
of four `- **Key:** value` bullets — the same line grammar every feature row already
uses — so `|` has no special meaning and cannot shift a value onto the wrong field.
Newlines are handled by the existing summary-field codec; backticks, em-dashes and
table-separator lookalikes are inert. `serialize → parse` is now an identity for every
field value, including leading and trailing whitespace, which the table used to trim.

Reading is backward-compatible: the legacy pipe table is still parsed, with its original
tolerances, so a `roadmap.md` or `_meta.md` written before this change keeps its history
instead of losing it on first read. Only the writer moved. The first re-serialization of
a document migrates it. A legacy row whose value contained a `|` was already destroyed
when it was written and cannot be recovered.

This repo's own `docs/roadmap.d/_meta.md` and the regenerated `docs/roadmap.md` are
migrated in this change, with all 18 existing records preserved.
