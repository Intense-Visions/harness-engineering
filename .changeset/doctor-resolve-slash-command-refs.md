---
'@harness-engineering/cli': patch
---

fix(cli): doctor resolves slash-command references instead of counting files

`harness doctor` reported `✓ Slash commands installed (N commands)` by counting
files in the output directory and never checking whether the `@`-references
inside them resolve. On a machine where the CLI had been upgraded (2.8.0 →
10.1.0) and the old install directory removed, every one of 51 commands pointed
at a `SKILL.md` that no longer existed — and doctor was green for ~10 days
(#1009). A slash command with a dangling `@` still runs, returning its wrapper
with the skill body silently absent, so doctor was the only surface that could
catch it.

The check now resolves rather than counts: for each generated command it
extracts the absolute `@`-referenced skill assets, verifies they exist, and
reports `N commands, M resolvable`. When `M < N` it fails, names the first dead
reference, and points at the fix — `harness generate-slash-commands` — which
regenerates against the current install. A command with no `@`-refs (e.g. Gemini
inlines the SKILL body) is self-contained and counts as resolvable.

This also closes the "silent for 10 days" surface behind #1010: an upgrade that
leaves generated commands pointing at the previous version's path is now
detectable and actionable rather than invisible (`harness update` already offers
regeneration post-upgrade).
