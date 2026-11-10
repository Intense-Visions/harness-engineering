---
'@harness-engineering/core': patch
---

fix(core): the complexity detector no longer overcounts `parameterCount` by splitting the parameter list on every comma. Commas nested inside generics, destructuring patterns, array/object defaults and string or template literals now belong to one parameter, and a trailing comma no longer adds one (#2279).
