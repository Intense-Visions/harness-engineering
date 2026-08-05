---
'@harness-engineering/cli': patch
---

Strip a harness-engineering-internal sub-project reference (`(sub-project #5)`) from the adopter-facing `harness check-design` command description. Part of the broader pass that genericizes internal roadmap/PR/issue/sub-project references leaking into shipped skills, slash commands, and subagent definitions, with a new guard test (`agents/skills/tests/internal-refs.test.ts`) that fails when a new internal reference reaches a distributed surface.
