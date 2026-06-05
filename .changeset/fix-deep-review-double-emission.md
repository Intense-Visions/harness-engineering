---
'@harness-engineering/cli': patch
---

Fix `runDeepReview` in `review-changes` MCP tool emitting the full unpaginated `findings` array via the embedded `pipeline` payload. After passing `_skipPagination: true` to the inner review call, the wrapper was re-emitting `pipeline: parsed` which still carried the full list, silently defeating the intent of the 22dd345f9 "double pagination" fix for any client reading `pipeline.findings`. Now strips `findings` and `findingCount` out of `pipeline` before re-emitting, keeping the paginated top-level fields as the canonical response shape. Surfaced by cross-phase review of the paged-mcp-tool-responses spec.
