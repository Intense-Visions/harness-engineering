---
'@harness-engineering/cli': patch
---

`protect-config` (PreToolUse:Write|Edit hook) now fails CLOSED (exit 2) in two
ambiguous cases instead of failing open: a well-formed request with a missing, empty, or
non-string `file_path`, and any unexpected error in the post-parse processing block. Both emit a
distinct fail-closed stderr line referencing the unresolvable edit target, rather than the
"protected config file" message, since the target is unknown. Absent/partial stdin
(unreadable, empty, or unparseable JSON) still fails OPEN (exit 0) with its existing log,
preserving the issue-#619 stability under v8 coverage. Closes the silent-yield security gap
without re-introducing the self-DoS.
