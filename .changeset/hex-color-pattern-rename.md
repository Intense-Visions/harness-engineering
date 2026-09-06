---
'@harness-engineering/cli': patch
---

Rename the internal `HEX_PATTERN` constant in the DRIFT-T001 token-bypass rule to `HEX_COLOR_PATTERN`, matching its siblings `FONT_FAMILY_PATTERN` and `PX_VALUE_PATTERN` which each name the design property they match. Internal, non-exported identifier — no behavior or API change.
