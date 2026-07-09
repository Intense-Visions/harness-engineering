---
'@harness-engineering/dashboard': patch
'@harness-engineering/local-models': patch
---

fix(lmlm): distinguish same-model quant rows + stop duplicate swap proposals

Two "same item" confusions on the Local Models panel:

- **Recommendations** listed the same `hfRepoId` at two quants (e.g. `Qwen3-32B`
  Q4_K_M @ 21.5 GB and Q8_0 @ 35.1 GB) as visually identical rows because the quant
  was never shown. The row now displays the quant, so the two options read as the
  distinct VRAM/speed trade-offs they are.
- **Pending proposals** could show the same install target twice (e.g. two
  "Swap in llama3.3:70b" rows for different pool members). The diff engine's dedup
  was per-`(target, replaces)` pair, so across ticks the same model accumulated
  multiple pending proposals — all pulling the same blob. The engine now also
  suppresses a candidate that is already the install target of an **open** proposal
  (rejections stay pair-scoped, since declining one swap of a model does not veto a
  different swap of it).
