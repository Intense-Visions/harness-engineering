---
'@harness-engineering/graph': patch
---

fix(graph): do not count a Python method's `self`/`cls` receiver in `parameterCount`

`CodeIngestor` counted the implicit `self` (instance) or `cls` (classmethod) receiver
as a declared parameter, so every Python method's `parameterCount` metadata was one
too high (`def find(self, key)` reported 2). The receiver is now excluded for Python
methods only; static methods and free functions are unchanged.
