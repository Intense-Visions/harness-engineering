---
'@harness-engineering/core': patch
---

Make the complexity detector's `findFunctionEnd` literal- and comment-aware. A
brace inside a string, template literal, regex literal, or comment no longer
moves the brace depth, so a function whose body contains `const open = '{';`
is measured at its real extent instead of running to EOF and absorbing every
following function's decision points.
