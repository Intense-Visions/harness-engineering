---
'@harness-engineering/dashboard': minor
---

feat(dashboard): author-intent form on PM/BA roadmap lane (#711)

Adds a first-class, plain-language "Author intent" panel to the Roadmap page
(`/s/roadmap`, the pm-ba lane's landing route), rendered only in the `pm-ba` and
`dev` lanes and hidden from the read/progress-oriented `client` lane. It writes a
backlog item through the existing `appendToRoadmap` → `POST /api/roadmap/append`
path — no chat thread, no slash command, no terminal — reusing the shipped
conflict/toast plumbing: on success it clears, confirms with a toast, and the new
row surfaces in the existing FeatureTable after the roadmap re-fetch; on a
409 conflict it surfaces the existing conflict toast and preserves the entered
content for retry. Lanes remain presentation-only (the server AUTHORIZATION SEAM
is untouched).
