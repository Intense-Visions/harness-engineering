---
'@harness-engineering/cli': patch
---

Move the first-run telemetry privacy notice from stderr to stdout so it is visible in IDE sessions where stderr is hidden, and reword it to truthfully describe what is collected (skill name/outcome/duration/phases, OS/Node/harness versions, a random install ID, and — when configured — git user.name and project/team names). The once-only first-run marker behavior and all telemetry send behavior are unchanged.
