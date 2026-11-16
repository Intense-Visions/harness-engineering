---
'@harness-engineering/cli': patch
---

fix(init): fresh scaffolds now survive the adopter's first commands (#2630)

- TypeScript scaffolds pin `@harness-engineering/cli` to the version that created them instead of `^0.1.0`, which was never published (`npm install` 404'd and every guarded command warned about a version mismatch).
- The base template now renders `docs/architecture.md`, the target of the `docs/index.md` link, so a fresh scaffold no longer fails `harness cleanup` on documentation drift.
- The Java scaffold's entry class is `Main.java` (was `App.java`, which the entry-point resolver does not recognise, so `harness cleanup` failed with "Could not resolve entry points").
- `harness init --tier minimal`: the pre-commit hook resolves the CLI from `node_modules/.bin`, then `PATH`, then `npx --package=@harness-engineering/cli` — a bare `npx harness` resolved the unrelated npm package `harness` and blocked every commit. The minimal tier also writes `.harness/.gitignore` so runtime artifacts are not staged.
