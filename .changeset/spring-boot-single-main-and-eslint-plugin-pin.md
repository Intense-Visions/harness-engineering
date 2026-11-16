---
'@harness-engineering/cli': patch
---

Fix two scaffold defects left over from #2630. A Spring Boot scaffold (`--language java --framework spring-boot`) no longer ships java-base's `Main.java` beside the overlay's `Application.java`: two main classes, one of them dead. Framework overlays can now declare the base files they replace (`replaces` in `template.json`), and a `replaces` entry that names no base file is a resolve error rather than a silent no-op. TypeScript scaffolds also stop pinning `@harness-engineering/eslint-plugin` at a stale `^0.1.0`: the pin is now the real eslint-plugin version, embedded into the published CLI at build time.
