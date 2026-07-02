---
slug: "move-sentinel-pre-post-to-standard-hook-profile"
milestone: "v5.0 — Trust & Security Model"
order: 0
---

### Move sentinel-pre/post to standard hook profile

- **Status:** done
- **Spec:** docs/changes/sentinel-standard-profile/proposal.md
- **Summary:** `packages/cli/src/hooks/profiles.ts:31-32` — `sentinel-pre` and `sentinel-post` (prompt-injection defense covering zero-width chars, RTL/LTR overrides, role-reassignment, permission-escalation, base64 exfiltration, destructive-bash in tainted sessions) currently ship at STRICT profile only. Default-profile adopters get NONE of this defense. Move to standard. Cost-tracker can remain strict-only as a separate concern. Source: Pass 6 #1.
- **Blockers:** —
- **Plan:** —
- **Assignee:** —
- **Priority:** P0
- **External-ID:** github:Intense-Visions/harness-engineering#556
