---
'@harness-engineering/core': patch
---

**The roadmap list-field codec was an inverse in one direction only, so every write corrupted prose in rows nobody edited.**

`encodeListField(decodeListField(x))` was not `x`. Since every `manage_roadmap`
call round-trips the whole roadmap, a single unrelated `add` silently rewrote
other rows.

The codec was built for #1757 to keep a comma INSIDE an authored list item, and
it does that correctly — `decode(encode(items)) === items` holds, which is what
the existing suite proves. The other direction was never tested, and legacy
`Plan` / `Blockers` values in the wild are not tidy tokens: they hold prose, and
prose is full of commas. `decodeListField` split on every bare comma and
`encodeListField` rejoined with `", "`, so each pass inserted a space that was
never in the file — `1,166` → `1, 166`, `146,585` → `146, 585`, `$2,241` →
`$2, 241`.

One project found 25 such corruptions accumulated over weeks, plus five more
from one `add` — in a different row from the one being added — which also
dropped that row's `Priority` and `External-ID` lines. The damage is cumulative
and invisible in review: it reads as a typo, in a file nobody diffs number by
number.

The module's own docstring asserted that "a plain item contains no backslash and
no comma, so both directions are identities on legacy content". That was true of
paths and tokens and false of sentences; it is corrected.

- The rule is now the grammar's own: `", "` is the only separator
  `encodeListField` ever writes, so it is the only one `decodeListField` reads
  and the only one `encodeListItem` escapes.
- `decodeListField` treats a comma as an item boundary only when whitespace
  follows. A bare `1,166` is content, not a split point.
- `encodeListItem` escapes a comma only when whitespace follows, which avoids the
  opposite failure of writing `1\,166` into a file a person has to read.
- Behaviour for genuine lists is unchanged, including the escaped-bullet form
  `- **Blockers:** Notification System\, phase 2` that #1757 added.

Six regressions cover thousands separators, the no-backslash-in-prose rule,
genuine `", "` boundaries, idempotence across repeated writes (one pass is not
enough to prove it — the corruption compounded), a full
`parse(serialize(roadmap))` cycle, and the two forms a naive repair regex would
break: a year list `1951, 1979, 1980` and a version-date
`(v42, 2026-09-04 17:23)`, both of which live in a real roadmap.

Repairing an already-damaged roadmap needs the same care the tests encode: the
obvious `\d, \d\d\d` also matches those correct forms, while
`(?<=\d), (\d{3})(?!\d)` separates them.
