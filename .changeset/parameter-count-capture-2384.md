---
'@harness-engineering/core': patch
'@harness-engineering/graph': patch
---

Parameter counting no longer stops at the first `)`. The complexity detector captured
parameters with `\(([^)]*)\)`, so a nested paren (`a = (x) => x`) cut the list short and
a method or arrow function with one was not matched at all. It now scans from the opening
`(` to its balancing `)`, and no longer mistakes `if (check(a)) {`-shaped statements for
methods. Parameter lists that span several lines are still skipped by the detector;
matching them is tracked separately because it changes which functions are measured.

The graph `CodeIngestor` `parameterCount` metadata had the same capture problem plus the
comma-split defect fixed in core by #2279: commas inside `[]`, `{}`, string literals and
a trailing comma were counted as separators, the `>` of `=>` closed a bracket, and a Go
method's receiver was counted instead of its parameters. It now uses the same depth-aware
counter and reads parameter lists that span several lines.
