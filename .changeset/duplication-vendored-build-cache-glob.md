---
'@harness-engineering/core': minor
---

Duplication detection now ignores vendored build caches by default. `DEFAULT_DUPLICATION_CONFIG.ignorePatterns` adds the dependency pre-bundles and build caches that front-end tooling writes into the project tree — `.vitepress/cache`, `.vite`, `.next`, `.nuxt`, `.output`, `.svelte-kit`, `.turbo`, `.parcel-cache`, `.cache` and `.angular/cache` — so clone classes made of generated output nobody refactors (e.g. VitePress's `deps_temp_*` pre-bundles) no longer appear in `harness cleanup -t duplication` or `detect_entropy`. First-party files next to them, such as `.vitepress/theme/`, are still scanned. A configured `duplication.ignorePatterns` still replaces the defaults.
