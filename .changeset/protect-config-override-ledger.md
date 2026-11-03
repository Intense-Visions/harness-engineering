---
'@harness-engineering/cli': minor
---

`protect-config` now allows an agent edit to a protected linter/formatter config when a human has recorded the decision in `.harness/config-overrides.json` (#2336). Before this, the hook blocked every such edit by file name with no way through, so a reviewed decision could only land as a hand edit outside the agent, which left no trail.

```json
{
  "overrides": [
    {
      "file": "eslint.config.mjs",
      "reason": "Turn off a rule whose hits are the behaviour under test",
      "decision": "https://github.com/owner/repo/pull/123",
      "approvedBy": "repo-owner",
      "expires": "2026-12-31"
    }
  ]
}
```

- An entry matches by **repo-relative path** (the repo root is the nearest ancestor containing `.git`), so one `eslint.config.mjs` entry does not unlock every same-named config in a monorepo.
- Every field must be a non-empty string, and `expires` must be a real `YYYY-MM-DD` date that is today or later (UTC, inclusive). Expired, partial, or malformed entries, and a ledger that does not parse, count as absent. The edit stays blocked, and the message says why.
- An allowed edit prints a one-line stderr notice naming the decision, the approver, and the expiry.
- The ledger itself (`config-overrides.json`) is now a protected file, so the allow path can never unlock it. Only a human, or a reviewed PR, adds entries.
- The block message now names the ledger as the way through.
- Fail policy is unchanged. The header comment now says correctly that unreadable stdin fails **closed** (since #993); only empty or unparseable stdin fails open.

Content-aware checking, which would block only edits that weaken enforcement, is a documented follow-up and is not part of this change.

**Upgrading:** run `harness hooks init` (or your usual CLI update) to refresh `.harness/hooks/protect-config.js`. No ledger means behaviour is the same as before.
