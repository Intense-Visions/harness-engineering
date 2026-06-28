---
'@harness-engineering/cli': patch
---

Resolve project-local skills in `skill info` and `skill run` (#587). Previously these commands resolved only through `resolveSkillsDir()`, which walks up from the compiled CLI module location first — so in a consuming repo it found the CLI's bundled skills and never the project's own `agents/skills/claude-code/<name>/`. A locally-authored skill was therefore listable via `skill list --local` but reported `Skill not found` by `info`/`run`. Both commands now resolve through a shared `resolveSkillDir(name)` helper that searches the same source set as `skill list` (project-local → community → bundled, first match wins), making discovery consistent across all `skill` subcommands.
