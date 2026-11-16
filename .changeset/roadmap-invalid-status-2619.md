---
'@harness-engineering/cli': patch
---

fix(cli): `manage_roadmap` add/update now reject an invalid `status` before writing. Before this fix the row was persisted and every later roadmap read failed (#2619).
