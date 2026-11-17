---
'@harness-engineering/cli': patch
---

Spring Boot scaffolds now render `Application.java` in the directory its `package` line names (`src/main/java/<groupId as path>/Application.java`) instead of `src/main/java/`. Template file and directory names can use `{{variable}}` placeholders, and the engine derives `javaPackagePath` from `javaGroupId`.
