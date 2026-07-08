---
'@harness-engineering/dashboard': minor
---

Add the Local Model Lifecycle Manager dashboard panel at `/s/local-models`: Hardware, Pool, and Recommendations (+ pending model proposals) cards, seeded from the `/api/v1/local-models/*` read routes and kept live via the `local-models:{pool,proposal}` WebSocket topics. Model proposals are approved/rejected through the shared `/api/v1/proposals/:id/{approve,reject}` route. Renders cleanly when the pool is empty, HuggingFace is unreachable, or no hardware is detected (O3).
