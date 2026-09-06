---
'@harness-engineering/core': patch
---

Make `parseAssignmentHistory` distinguish "no `## Assignment History` heading" from "heading present, zero records parsed". It returned `Ok([])` for both, and because `serializeRoadmap` omits the section when the record list is empty, an unreadable history and an absent history produced byte-identical output — so `harness roadmap regen` deleted the whole section at exit 0 with a success banner. An absent heading still yields `Ok([])`; a heading whose content yielded no record is now an `Err`, and the regen path (which already returns before writing on a failed parse) refuses to write the truncated aggregate instead of reporting success.
