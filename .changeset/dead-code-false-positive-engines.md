---
'@harness-engineering/core': patch
'@harness-engineering/cli': patch
---

fix(entropy): remove three dead-code false-positive engines (#2075)

- A configured entry point under a skip-dir (e.g. `src/bin/harness.ts`) is now scanned together with its sibling modules, instead of being dropped by the `bin` walker skip-dir before config is consulted. Test files under a matching `bin/` test directory now contribute their import edges too.
- Extensionless imports of a dotted basename (`./budget.types`, `./app.config`) now resolve to `budget.types.ts` / `app.config.ts`.
- Default imports, aliased named imports (`{ a as b }`), `export { default } from` / `export { default as X } from` re-exports, and dynamic `import()` now credit the export they consume in the usage map.
