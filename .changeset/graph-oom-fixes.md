---
'@harness-engineering/graph': patch
---

Fix OOM and stability issues

- Resolve OOM in CodeIngestor and optimize directory traversal
- Prevent OOM during graph serialization by streaming JSON output
- Add missing NodeType import in CoverageScorer
- Add missing lokijs runtime dependency
- Relax flaky timing assertion and increase graph test timeout
- Address integrity review suggestions across pagination, logging, and observability
