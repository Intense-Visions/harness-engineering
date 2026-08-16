---
'@harness-engineering/graph': patch
---

fix(graph): method-level @RequestMapping no longer overwrites Java basePath

ApiPathExtractor now derives the file-wide Spring basePath only from a
class/interface/enum-level `@RequestMapping`, classified by its target declaration
rather than the brittle "this line lacks `class`" heuristic. A method-level
`@RequestMapping` now contributes the method path (e.g. class `/api` + method `/foo`
resolves to `/api/foo`) instead of overwriting basePath, and the class-level
annotation is no longer emitted as a spurious endpoint.
