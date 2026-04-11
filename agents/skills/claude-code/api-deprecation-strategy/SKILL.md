# API Deprecation Strategy

> DEPRECATION STRATEGY DEFINES THE STRUCTURED PROCESS OF RETIRING API VERSIONS AND ENDPOINTS — USING SUNSET AND DEPRECATION HEADERS, MIGRATION GUIDES, AND COMMUNICATION CADENCE TO MOVE CONSUMERS FORWARD WITHOUT SURPRISE OUTAGES OR BROKEN INTEGRATIONS.

## When to Use

- Planning the retirement of a v1 API version after v2 has launched and reached sufficient adoption
- Implementing machine-readable deprecation signals on responses so consumer tooling can surface warnings
- Designing migration guide structure and content for a breaking API change
- Setting deprecation policy for an API platform that will deprecate endpoints on a recurring basis
- Auditing an existing API whose version retirement process has caused consumer outages or complaints
- Building SDK tooling that detects and surfaces deprecation warnings from response headers
- Establishing compatibility window standards for an API team or organization style guide

## Instructions

### Key Concepts

1. **Sunset header (RFC 8594)** — The `Sunset` HTTP response header communicates the date and time after which a resource will no longer be available. Its value is an HTTP-date: `Sunset: Sat, 01 Jun 2025 00:00:00 GMT`. RFC 8594 defines the standard so that generic tooling — API clients, SDK generators, monitoring dashboards — can parse and act on it without bespoke logic. Emit `Sunset` on every response from a deprecated endpoint, not just the first request.

2. **Deprecation header** — The `Deprecation` HTTP response header (draft RFC) marks a resource as deprecated without implying imminent removal. Its value is a boolean (`Deprecation: true`) or an HTTP-date indicating when deprecation began (`Deprecation: Mon, 01 Jan 2024 00:00:00 GMT`). Pair it with a `Link` header pointing to the migration guide: `Link: <https://api.example.com/migration/v1-to-v2>; rel="deprecation"`. The `Deprecation` header signals "this still works but you should migrate"; `Sunset` signals "this stops working on [date]".

3. **Migration guide design** — A migration guide must contain: a summary of every breaking change (not just "see changelog"), before/after request/response examples for each changed endpoint, a step-by-step migration checklist, and a compatibility testing strategy. The guide is a contract document — publish it at a stable, versioned URL and do not alter it after the sunset date is announced. Consumers link to it from their own internal docs.

4. **Compatibility windows** — Define minimum windows at API launch, not at deprecation time: for example, "v1 will be supported for at least 18 months after v2 GA." Public-facing APIs typically commit to 12–24 month windows; internal APIs may use shorter windows (3–6 months) if consumer teams are coordinated. The window starts from the v2 GA announcement, not from the v1 deprecation announcement. Publish the policy in the API reference docs.

5. **Communication cadence** — Deprecation is a communication process, not a technical event. Effective cadence: (1) Announce v2 GA and v1 deprecation start simultaneously; (2) Send email and in-app notifications to all consumers with active v1 traffic; (3) Emit `Deprecation` + `Sunset` headers from day one; (4) Send reminder notifications at 6 months, 3 months, 1 month, and 1 week before sunset; (5) Monitor v1 traffic and personally contact consumers still active at the 1-month mark; (6) Execute sunset and return `410 Gone` on all v1 endpoints.

6. **Post-sunset response** — After the sunset date, retired endpoints must return `410 Gone` (not `404 Not Found`). `410` is permanent and semantically distinct: it signals "this resource existed and was intentionally removed" rather than "this resource was never here." Include a body pointing to the migration guide and the v2 equivalent endpoint. Log all `410` responses for consumer diagnosis.

### Worked Example

The GitHub REST API deprecation of the Issues Search endpoint demonstrates production-grade deprecation headers:

**Deprecated endpoint response:**

```http
GET /legacy/issues/search/{owner}/{repository}/{state}/{keyword}
Authorization: Bearer ghp_...
```

```http
HTTP/1.1 200 OK
Content-Type: application/json
Deprecation: true
Sunset: Fri, 01 Aug 2025 00:00:00 GMT
Link: <https://docs.github.com/rest/search/search#search-issues-and-pull-requests>; rel="successor-version"
Link: <https://docs.github.com/rest/deprecations>; rel="deprecation"

{ ... }
```

The `Link` header with `rel="successor-version"` points to the replacement endpoint. `rel="deprecation"` points to the general deprecation policy page. Generic tooling can follow these links without service-specific knowledge.

**Stripe deprecation communication — version changelog:**

```
Stripe Version 2022-08-01 — Breaking Changes:
- PaymentIntent.status values changed: "requires_source" renamed to "requires_payment_method"
- Removed: charges.refunds nested array (use /v1/refunds?charge=ch_xxx instead)

Sunset date: 2024-08-01

Migration guide: https://stripe.com/docs/upgrades#2022-08-01
```

Stripe emails all customers with API keys created before the breaking version, providing the changelog summary and a direct link to the migration guide. The `Stripe-Version` header on all responses surfaces the currently active version so consumers can see their pinned version in logs.

**Twilio post-sunset 410 response:**

```http
GET /2008-08-01/Accounts/{AccountSid}/Calls
Authorization: Basic ...
```

```http
HTTP/1.1 410 Gone
Content-Type: application/json

{
  "code": 20006,
  "message": "API version 2008-08-01 has been retired.",
  "more_info": "https://www.twilio.com/docs/usage/api/api-versioning",
  "status": 410
}
```

Twilio's `410` body includes a machine-readable code (`20006`), a human-readable message naming the specific version, and a link to the versioning documentation.

### Anti-Patterns

1. **Announcing sunset with insufficient notice.** A 30-day sunset window for a public API is effectively a forced outage for consumers who do not monitor response headers or release notes. Fix: commit to minimum compatibility windows at API launch (12–24 months for public APIs), announce the window with v2 GA, and surface the `Sunset` header in developer dashboards and SDK warnings.

2. **Returning 404 instead of 410 after sunset.** `404 Not Found` on a sunset endpoint causes consumer teams to spend hours debugging routing, authentication, and typos before realizing the endpoint was retired. `410 Gone` is unambiguous. Fix: implement a specific `410` handler for sunset endpoints with a body pointing to the migration guide, active during the post-sunset monitoring window.

3. **Migration guides without before/after examples.** A migration guide that lists breaking changes in prose without showing the actual HTTP request/response change forces consumers to reverse-engineer each change. Fix: every breaking change entry in the migration guide must include the v1 request, v1 response, v2 request, and v2 response in full.

4. **Emitting deprecation headers only on the first request.** Some implementations add deprecation headers only when the consumer has not visited the migration page. This breaks SDK tooling and monitoring dashboards that aggregate headers across sampled responses. Fix: emit `Deprecation` and `Sunset` on every response from every deprecated endpoint, unconditionally.

## Details

### SDK Integration for Deprecation Detection

SDKs should inspect response headers on every call and surface deprecation warnings to developers at integration time. Example pattern in a hypothetical SDK:

```javascript
// In HTTP response handler
if (response.headers['deprecation']) {
  const sunset = response.headers['sunset'];
  const link = parseLinkHeader(response.headers['link'])?.deprecation;
  console.warn(
    `[API SDK] Deprecated endpoint called. Sunset: ${sunset ?? 'unspecified'}. ` +
      `Migration guide: ${link ?? 'see API docs'}`
  );
}
```

This transforms a passive HTTP header into an active developer warning visible in test output and CI logs — significantly increasing discovery rate compared to documentation-only communication.

### Traffic Monitoring During Deprecation Window

Instrument v1 traffic by consumer (API key or OAuth client ID) throughout the deprecation window. Track the migration rate: percentage of consumers with zero v1 calls in the trailing 7 days. Reach out personally (email, Slack, account manager) to consumers still active at the 30-day mark. At the 7-day mark, send a final warning with concrete impact details: "Your integration made 14,382 calls to deprecated endpoints in the past 7 days. These will fail on [date]."

### Real-World Case Study: Twilio API Version Retirement

Twilio retired their 2008-08-01 API version after a 3-year deprecation window. Their process: (1) Announced sunset 24 months in advance via email and developer blog; (2) Added `Deprecation` and `Sunset` headers to all v1 responses; (3) Published a migration guide with endpoint-by-endpoint mappings; (4) Monitored traffic by account SID and sent personalized outreach to all accounts with active legacy traffic at 90, 30, and 7 days before sunset; (5) Provided a free migration review service through their developer relations team. Result: 99.2% of traffic migrated before sunset. The 0.8% that failed at sunset were stale integrations with no active account owners — all were resolved within 48 hours through support tickets. Twilio's post-mortem noted that the personal outreach at 30 days drove 60% of the remaining migrations and was the highest-ROI activity in the deprecation process.

## Source

- [RFC 8594 — The Sunset HTTP Header Field](https://rfc-editor.org/rfc/rfc8594)
- [Deprecation Header (IETF Draft)](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-deprecation-header)
- [GitHub REST API Deprecations](https://docs.github.com/en/rest/overview/api-previews-and-deprecations)
- [Stripe API Upgrade Guide](https://stripe.com/docs/upgrades)
- [APIs You Won't Hate — Surviving Deprecation](https://apisyouwonthate.com/blog/surviving-deprecation)

## Process

1. Define the compatibility window policy (e.g., 18 months minimum) and publish it in API reference documentation before any version ships.
2. At v2 GA, begin emitting `Deprecation` and `Sunset` headers on all v1 responses, with `Link` headers pointing to the migration guide.
3. Send deprecation announcement to all consumers with active v1 traffic; include the sunset date, changelog summary, and migration guide link.
4. Monitor v1 traffic by consumer throughout the window; send reminder notifications at 6 months, 3 months, 1 month, and 1 week before sunset.
5. At sunset, return `410 Gone` on all retired endpoints with a body pointing to the migration guide and the v2 equivalent.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** api-backward-compatibility, api-versioning-url, api-sdk-ergonomics

## Success Criteria

- All deprecated endpoints emit `Deprecation` and `Sunset` response headers on every response, not just the first.
- A migration guide with before/after HTTP examples exists for every breaking change in the deprecated version.
- The compatibility window policy is published in API documentation before any version launches, not at deprecation time.
- Consumers are notified of deprecation through at least two channels (email + response headers) with a minimum of 12 months notice for public APIs.
- Sunset endpoints return `410 Gone` with a body pointing to the migration guide, not `404 Not Found`.
