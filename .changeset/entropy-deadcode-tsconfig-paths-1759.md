---
'@harness-engineering/core': patch
---

Resolve tsconfig `paths` aliases in the entropy dead-code detector. Previously `resolveImportToFile` treated every non-relative specifier as an external package, so any file reached only through a path-alias import (e.g. `@lib/aliased`) was silently and confidently reported dead. The snapshot builder now loads the project's tsconfig `paths` + `baseUrl` (JSONC-tolerant, with bounded relative `extends` support) into `CodebaseSnapshot.pathAliases`, and the reachability/usage resolver matches alias specifiers through the same extension/index resolution used for relative imports. Fixes #1759.
