# Graph token-savings benchmark — results

> Issue #1271. Methodology: [`REPRODUCING.md`](./REPRODUCING.md). Machine-readable:
> [`results/latest.json`](./results/latest.json). Re-run with `pnpm run bench:graph-tokens`.

## Headline (this repository)

Measured on the harness-engineering repo's own graph (51,235 nodes, 1,329,351 edges), 26
scenarios across 6 families, anchors derived deterministically from graph structure:

| Metric             | Graph-scoped | Naive file-by-file | Result                 |
| ------------------ | -----------: | -----------------: | ---------------------- |
| **Tokens (total)** |       93,482 |          2,475,351 | **26.5× fewer tokens** |
| **Tool calls**     |           26 |              1,156 | **44.5× fewer calls**  |

Both exceed the honest comparator target (arXiv 2603.27277: ~10× tokens, ~2.1× tool calls).
**Read the caveats below before quoting these numbers** — the graph side returns _scoped
summaries_, the naive side returns _full file content_, and answer quality is not yet measured.

## Per-family

| Family         | Scen | Graph tok | Naive tok |      Token× | Tool-call× |
| -------------- | ---: | --------: | --------: | ----------: | ---------: |
| `impact`       |    5 |       673 |   913,219 | **1356.9×** |     102.4× |
| `blast-radius` |    5 |     7,197 |   913,219 |  **126.9×** |     102.4× |
| `dependencies` |    5 |       322 |   347,228 | **1078.4×** |      17.2× |
| `outline`      |    5 |     6,272 |   128,236 |   **20.5×** |       2.0× |
| `ask`          |    3 |     5,095 |   120,439 |   **23.6×** |       6.0× |
| `find-context` |    3 |    73,923 |    53,010 |   **0.72×** |       6.0× |
| **OVERALL**    |   26 |    93,482 | 2,475,351 |   **26.5×** |      44.5× |

## Honest reading of the number

This is a favourable result, but it must be read with the following caveats — all reported so the
number is trustworthy rather than flattering:

1. **Summary vs full content (the biggest caveat).** The graph side uses each tool's
   density-appropriate _scoping_ mode (`get_impact --summary`, `query_graph --summary`,
   `compute_blast_radius --compact`) — the surface an agent actually puts into context: impacted-file
   counts, top-risk items, node/edge summaries. The naive side reads whole files. So part of the
   gap is that the graph returns a _scoped answer_ while naive returns _raw content_. Whether the
   scoped summary actually suffices to answer the question is the **answer-quality axis (the
   comparator's "83%")**. That axis is now **measurable, opt-in and advisory**: pass `--judge`
   and an LLM judge grades whether each strategy's retrieved payload is _sufficient_ to answer the
   query (`answerQuality` in the JSON result; per-scenario `quality` grades). It reuses the shared
   harness eval/judge plumbing (`resolveAnalysisProvider` → Anthropic key or `HARNESS_ANALYSIS_BASE_URL`),
   and **degrades honestly**: with no judge configured it reports `status: "inconclusive"` rather
   than fabricating a score, and it _never_ fails the benchmark — the token/tool-call axes stand
   regardless. The headline numbers above are token/tool-call only (run without `--judge`); treat
   the token ratio as "cost to retrieve a scoped answer", not "cost to retrieve an equally-complete
   answer". A published multi-repo answer-quality number remains a deferred slice (`Refs #1271`).

2. **`find-context` is a loss (0.72×) — reported, not hidden.** `find_context_for` expands a 2-hop
   subgraph (nodes + edges as JSON) around each search hit, which is more verbose than reading the
   top-5 keyword-matched files. The graph is not universally cheaper; this family is the honest
   counter-example.

3. **Detailed mode is catastrophically large on hot anchors — a real finding.** When the same
   `get_impact` / `query_graph` calls run in **detailed** mode against the _most-connected_ file
   nodes, the payloads explode: on this repo the 5 `impact` anchors serialized to **≈293 million
   tokens** (the full bidirectional 3-hop neighborhood of the graph's hub nodes) and the 5
   `dependencies` anchors to **≈4.47 million tokens**. No agent should dump that into context — which
   is exactly why the scoping modes exist — but it is a genuine roadmap input: detailed-mode output
   is unbounded on hub nodes and would benefit from default pagination or a size ceiling. This
   worst case is excluded from the headline (it is not the scoping surface and is memory-heavy to
   materialize on every run), and preserved here so the finding is on record.

4. **Conservative naive baseline.** The naive side reads only files that actually match the grep /
   keyword search. A real graph-less agent typically over-reads (opens unrelated files too), so the
   naive cost — and thus the savings — is a lower bound.

5. **Single repo.** This is harness-engineering's own graph. The comparator spans 31 repos;
   broadening to a corpus is a deferred slice.

## Verdict

On the two objective axes this benchmark measures — retrieval tokens and tool calls — graph-scoped
retrieval on this repo comfortably beats the honest comparator target, driven by the structural
families (`impact`, `dependencies`, `blast-radius`). The result is bounded by two honest facts: the
headline is token/tool-call only (the answer-quality axis is opt-in via `--judge` and advisory, not
folded into the headline number), and `find-context` loses. The detailed-mode blowup is filed as a
roadmap input. This is the first published token number for the harness code graph; the methodology
is re-runnable so the number can be kept current and extended to the deferred axes.
