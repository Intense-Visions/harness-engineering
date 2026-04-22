---
'@harness-engineering/cli': patch
---

fix(init): skip project scaffolding for pre-existing projects (#235)

`harness init` no longer creates scaffold files (pom.xml, App.java, etc.) when the target directory already contains a project. Detects existing projects by checking for common build/config markers and only writes harness config files.
