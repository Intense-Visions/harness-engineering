# Risk keywords for depth calibration

> Used by Phase 3.5 CALIBRATE in `harness-code-review` to elevate a diff's depth tier when sensitive surfaces are touched. The list below is the **single source of truth** — Decisions 7 and 8 of the spec reference this file rather than re-enumerating. Modifications to this list are policy decisions; updates require PR review.

The calibrator matches against the changed-file content, file paths, and the commit message. Matching is case-insensitive and whole-word where possible (substring for path matches like `auth/` directories).

## Canonical list

```
auth
authn
authz
password
token
payment
billing
migration
migrate
external API
webhook
cryptography
crypto
session
cookie
personally identifiable
PII
compliance
```

## Tier rules (from spec Decision 8)

| Diff size | Keywords matched | Depth tier |
| --------: | ---------------: | ---------- |
|    `< 50` |              `0` | Quick      |
|  `50–199` |              `0` | Standard   |
|    `< 50` |              `1` | Standard   |
|       any |            `≥ 2` | Deep       |
|   `≥ 200` |              any | Deep       |

Author override: `--depth quick|standard|deep` forces the tier and bypasses calibration.
