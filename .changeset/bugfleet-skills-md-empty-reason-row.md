---
'@harness-engineering/cli': patch
---

Keep interior blank cells when parsing a SKILLS.md table row. The blanket empty-cell filter also shed legitimate interior blanks, so a match with no `matchReasons` rendered a row that `parseSkillsMd` then silently discarded, breaking the round-trip fidelity the module promises.
