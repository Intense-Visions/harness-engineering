---
'@harness-engineering/core': patch
---

The comprehension dependency slice no longer renders import lines TypeScript rejects.
A module that both namespace-imports and named-imports one source used to render
`import * as core, { CloneIndex } from '...'`, and a side-effect or dynamic import
rendered `import from '...'`. A namespace binding beside a named group (or a second
default or namespace) now gets its own statement, and a binding-less import renders as
`import '...'`. Committed units keep their semantic halves; only their import lines change.
