---
'@harness-engineering/core': patch
---

Dead-code detection now resolves bare specifiers that name a workspace package (`@scope/pkg`, `@scope/pkg/sub`) to the package's source file, reusing the layer check's workspace-member resolver. A symbol exported by one package and imported by another by package name is no longer reported dead; external `node_modules` packages stay unresolved as before (#2189).
