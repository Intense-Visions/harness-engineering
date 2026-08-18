---
'@harness-engineering/local-models': patch
---

Fix HuggingFace candidate discovery `trending` sort (was a hard 400) and surface evaluated candidates in the refresh-tick log.

- The wide-net discovery's trending arm passed `sort=trending` straight onto the HF `/api/models` wire, which HF rejects with `400 Invalid sort parameter`. It has always fallen back to downloads-only, emitting one warning per approved org each tick. The correct HF spelling is `trendingScore`; the trending arm now works.
- `TickResult` now carries `evaluatedCandidates` (`hfRepoId@quant` ids) and the O1 `local-models refresh tick` log line includes a `candidates` field, so operators can see _which_ models a tick evaluated, not just the count.
