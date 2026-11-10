---
'@harness-engineering/core': patch
---

`detectCircularDeps` now reports each cycle as a real closed import walk. For a
strongly connected component with branching edges (two or more cycles sharing a
file), the chain used to follow Tarjan discovery order, so `check-deps` could
print consecutive files with no import between them. The chain is now the
shortest cycle through the component's lowest-sorted file, starting there, so
it no longer depends on traversal order, and neither does the arch
`circular-deps` violation id that hashes it. `size` still counts every file the
component entangles (#2390).
