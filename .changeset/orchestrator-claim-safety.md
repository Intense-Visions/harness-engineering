---
'@harness-engineering/orchestrator': patch
---

Stop the file-backed roadmap orchestrator from claiming roadmap items already
assigned to another developer or another orchestrator. `selectCandidates`
now accepts an optional `selfAssignee` and skips items whose `assignee` is a
third party. `RoadmapTrackerAdapter.claimIssue` no-ops the write when a
third party currently holds the assignee, so the existing
`ClaimManager.claimAndVerify` verify step reads back the unchanged file and
returns `'rejected'` instead of silently overwriting the assignment.
