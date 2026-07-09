---
'@harness-engineering/dashboard': patch
'@harness-engineering/local-models': patch
---

fix(lmlm): round numbers on the Local Models panel so raw floats stop leaking

Disk usage, pool entry sizes/scores, hardware values, and the model-proposal
justification text rendered raw floats (`75.65831765532494 GB`,
`score 57.629999999999995`, `18.067657947540283GB VRAM est`). They now follow the
panel's existing convention via a shared formatter: sizes/VRAM to one decimal,
absolute scores as whole numbers. The server-side `buildJustification` rounds the
score and VRAM values it embeds, so the stored proposal summary is clean too.
