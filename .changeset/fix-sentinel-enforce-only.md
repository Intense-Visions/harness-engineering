---
'@harness-engineering/cli': patch
---

fix(sentinel): make sentinel-pre enforce-only so it no longer taints on the agent's own tool inputs

sentinel-pre previously ran injection detection and wrote taint on tool INPUTS,
contradicting its documented enforce-only role. Legitimate agent activity — commit-bypass
flags, base64/git-SHA tokens — tainted the 30-minute session window and then blocked the
agent's own git push/commit as "destructive". Detection now lives solely in sentinel-post
(which scans untrusted tool OUTPUT, the real prompt-injection vector); sentinel-pre only
enforces existing taint. A genuinely tainted session still blocks destructive operations.
