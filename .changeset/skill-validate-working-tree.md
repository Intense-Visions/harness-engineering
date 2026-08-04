---
'@harness-engineering/cli': patch
---

fix(cli): skill validate scans the working tree, honours its argument, reports the denominator

`harness skill validate` resolved its skills directory with `resolveSkillsDir()`,
which walks up from the CLI's own install location and therefore scanned the
**installed bundle** (`<cli>/dist/agents/skills/...`), not the working tree. When
authoring a skill in a checkout of this repo the validator could not see it, so
it reported neither pass nor fail — its silence read as approval, and
`harness-skill-authoring`'s "no skill ships without validation passing" gate
could be satisfied while the validator had never looked at the file (#1011).

Three fixes:

- **Scan the working tree when inside a harness checkout.** Resolution now prefers
  `resolveProjectSkillsDir()` (the `agents/skills/` above cwd), falling back to
  the bundle otherwise, so a newly authored skill is actually validated.
- **Honour the skill-name argument.** `harness skill validate <name>` validates
  just that skill and fails if it is not found, instead of ignoring the argument
  and validating the whole catalog.
- **Report the denominator.** Output now says `Validated N skill(s) in <dir>`
  (and the `--json` payload carries `skillsDir` + `scanned`), so "no errors" is
  distinguishable from "nothing checked".
