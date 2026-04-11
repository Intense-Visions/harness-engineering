# API Backward Compatibility

> BACKWARD COMPATIBILITY IS THE GUARANTEE THAT EXISTING CLIENTS CONTINUE TO WORK WITHOUT MODIFICATION AFTER AN API CHANGE — MASTERING THE ADDITIVE CHANGE RULES, POSTEL'S LAW, AND BREAKING CHANGE TAXONOMY LETS TEAMS EVOLVE APIS RAPIDLY WITHOUT FORCING CONSUMERS INTO LOCKSTEP MIGRATIONS.

## When to Use

- Reviewing a PR that modifies an existing API endpoint to determine whether the change is breaking
- Designing an API evolution policy for a platform that ships multiple services to external consumers
- Implementing automated breaking-change detection in a CI pipeline using schema diffing tools
- Auditing an API whose consumers report unexpected failures after a non-major release
- Establishing which changes require a new URL version versus which can be deployed to the current version
- Training a team on the additive-only change model before their first API public launch
- Choosing between evolving an existing endpoint and introducing a parallel endpoint for a new behavior

## Instructions

### Key Concepts

1. **Additive change rules** — Changes are backward compatible when they only add, never remove or modify existing contracts. Safe additive changes: new optional request fields (with documented defaults), new response fields (existing clients ignore unknown fields), new endpoints, new enum values in responses (clients must handle unknown values), new optional query parameters, and relaxed validation (accepting previously rejected inputs). Each of these leaves existing clients working without modification.

2. **Breaking change taxonomy** — A breaking change is anything that causes an existing valid client to fail or behave differently without a code change. Categories: (a) Removed fields, endpoints, or enum values; (b) Changed field type (string → integer); (c) Changed field semantics (timestamp format, currency unit, pagination behavior); (d) Added required request fields without defaults; (e) Narrowed validation (rejecting previously accepted inputs); (f) Changed HTTP status codes for existing conditions; (g) Changed authentication requirements; (h) Reordered array responses where order was previously stable and clients depended on it.

3. **Postel's Law (Robustness Principle)** — "Be conservative in what you send, be liberal in what you accept." For APIs: accept a wider range of inputs than the minimum required (graceful handling of extra fields, lenient format parsing, ignoring unknown query parameters) and produce tightly specified, minimal outputs. Liberal input acceptance prevents client breakage when clients send slightly different payloads across library versions. Conservative output production prevents clients from depending on undocumented fields that may change.

4. **New enum values are semi-breaking** — Adding a new value to a response enum (`status: "PENDING" | "ACTIVE" | "CLOSED"` → `"PENDING" | "ACTIVE" | "CLOSED" | "SUSPENDED"`) is additive in theory but breaking in practice for clients with exhaustive switch statements that throw on unknown values. Communicate new enum values with advance notice. Recommend in API documentation that clients implement a default case for unknown enum values. Consider using string types with a documented set rather than language-level enums.

5. **Consumer-driven contract testing** — Backward compatibility cannot be verified by inspecting only the provider side. Consumer-driven contract tests (Pact, Spring Cloud Contract) encode each consumer's actual usage as a contract. The provider runs all consumer contracts in CI — if any consumer contract fails against the new provider code, the change is breaking for that consumer. This is the only automated method that catches semantic breaking changes (changed field meaning, changed ordering, changed pagination behavior) that schema diffing misses.

6. **Automated breaking-change detection** — Schema-level breaking changes can be caught with OpenAPI diffing tools (oasdiff, Optic, Speakeasy). These tools compare two API schemas and classify each difference as `non-breaking`, `potentially-breaking`, or `breaking` according to a taxonomy. Integrate in CI: compare the PR's OpenAPI spec against the base branch spec and fail the build on any `breaking` classification. This catches removed fields, type changes, and removed endpoints automatically.

### Worked Example

The Google AIP-180 guidelines define Google's backward compatibility policy for all Google Cloud APIs. Their taxonomy is the most comprehensive publicly available:

**Safe (non-breaking) changes per AIP-180:**

```
- Adding a new API service
- Adding a new method to an existing service
- Adding a new resource field (output only or optional with default)
- Adding a new enum value (with documented handling of unknown values)
- Adding a new HTTP binding for an existing RPC
- Changing a required field to optional (with documented default)
```

**Breaking changes per AIP-180:**

```
- Removing or renaming a field, method, enum value, or service
- Changing the type of a field
- Adding a required field to a request message
- Changing an error code for an existing condition
- Changing the URL path of an existing method
```

**GitHub API additive evolution — new response field:**

GitHub added the `node_id` field to all resource responses in their REST API as part of their GraphQL migration. This is a textbook additive change: existing clients receive an extra field they ignore, new clients use it for GraphQL interoperability.

```http
GET /repos/octocat/Hello-World
Accept: application/vnd.github+json
```

```http
HTTP/1.1 200 OK

{
  "id": 1296269,
  "node_id": "MDEwOlJlcG9zaXRvcnkxMjk2MjY5",
  "name": "Hello-World",
  "full_name": "octocat/Hello-World",
  ...
}
```

Old clients deserializing into a typed model simply ignore `node_id`. Clients that explicitly reject unknown fields (strict mode parsers) would break — GitHub's documentation recommends lenient deserialization for this reason.

**Stripe breaking change taxonomy — a version changelog entry:**

```
2022-08-01 — Breaking Changes:

REMOVED: PaymentIntent.payment_method_types[] will no longer include "card" by default.
  Before: { "payment_method_types": ["card"] }
  After:  { "payment_method_types": [] } — must be set explicitly

CHANGED: Invoice.status_transitions.paid_at changed from Unix timestamp to ISO 8601 string.
  Before: { "paid_at": 1672531200 }
  After:  { "paid_at": "2023-01-01T00:00:00Z" }

Migration guide: https://stripe.com/docs/upgrades#2022-08-01
```

Both are breaking under the taxonomy: the first removes a default value clients depend on; the second changes the type of an existing field.

### Anti-Patterns

1. **Strict unknown field rejection on the server.** Returning `400 Bad Request` when clients send extra fields that the server does not recognize breaks forward compatibility — clients on newer SDK versions that add optional fields will fail against servers on older versions. Fix: apply Postel's Law to input parsing; ignore unknown request fields and log them for observability without rejecting the request.

2. **Trusting schema diffing alone for breaking change detection.** OpenAPI diffing tools catch structural changes (removed fields, type changes) but miss semantic breaking changes: a field whose format changes from `YYYY-MM-DD` to Unix timestamps is structurally identical (both strings or both integers) but semantically breaking. Fix: combine schema diffing with consumer-driven contract tests to catch semantic breakage.

3. **Treating changelog entries as sufficient consumer notification.** Publishing a breaking change in a changelog that consumers must proactively monitor is insufficient for public APIs. Consumers who do not follow changelogs — a majority — will only discover the break in production. Fix: emit `Deprecation` headers on affected responses before the change, and send direct notifications to all consumers with usage of the affected endpoint.

4. **Relaxing then re-tightening validation.** Changing validation from strict to lenient (additive — clients sending previously rejected payloads now succeed) is safe. Reverting that relaxation (re-tightening) is breaking — clients that started sending the previously rejected input in the window between changes will now fail again. Fix: treat validation changes as one-way ratchets; never re-tighten without a version bump.

## Details

### The Field Removal Protocol

Removing a field is one of the most common breaking changes. The safe removal protocol has four stages:

1. **Deprecate in documentation** — Mark the field as deprecated in the OpenAPI spec with a `deprecated: true` annotation and a description pointing to the replacement.
2. **Emit response with null/empty** — Begin returning `null` or an empty value for the deprecated field while keeping it present in the response shape.
3. **Remove from documentation** — Stop documenting the field in API reference while still emitting it in responses (allows clients to see it but not depend on new behavior).
4. **Remove from response** — After the compatibility window expires (and `Sunset` date has passed), stop emitting the field entirely. This is the only stage that is a breaking change under strict definition — stages 1–3 are all compatible.

### Breaking Change Detection in CI with oasdiff

```bash
# Install oasdiff
npm install -g @oasdiff/oasdiff

# Compare base branch spec vs PR spec
oasdiff breaking openapi-base.yaml openapi-pr.yaml

# Exit code 1 on any breaking change — fail CI
oasdiff breaking openapi-base.yaml openapi-pr.yaml --fail-on-breaking
```

`oasdiff` classifies each difference and emits structured output listing the breaking classification, the affected path/method, and the change description. Integrate in GitHub Actions:

```yaml
- name: Check API breaking changes
  run: oasdiff breaking openapi-main.yaml openapi-pr.yaml --fail-on-breaking
```

### Real-World Case Study: Stripe Additive Evolution Without Version Bumps

Between 2018 and 2023, Stripe added over 200 new fields to their API responses, introduced 40+ new endpoints, and added 15+ new optional request parameters — all without incrementing the URL version (`/v1/` remains the only version prefix). Each change was classified as additive using their internal breaking-change taxonomy. Their published guidance to SDK authors: "Deserialize response bodies leniently. Unknown fields are features, not errors." Stripe's SDKs implement this by default — the Ruby, Python, and Node SDKs accept unknown response fields and make them accessible as dynamic attributes. This philosophy has enabled 5 years of substantial API evolution with zero forced consumer migrations while maintaining a `/v1/` URL prefix that has been stable since 2011. The lesson: rigorous application of additive-only rules, combined with lenient client deserialization, makes URL version bumps rare rather than routine.

## Source

- [Google AIP-180 — Backwards Compatibility](https://aip.dev/180)
- [Stripe API Versioning Philosophy](https://stripe.com/blog/api-versioning)
- [Pact — Consumer-Driven Contract Testing](https://pact.io)
- [oasdiff — OpenAPI Breaking Change Detection](https://github.com/Tufin/oasdiff)
- [APIs You Won't Hate — Breaking Changes](https://apisyouwonthate.com/blog/what-is-a-breaking-change)

## Process

1. Publish a breaking-change taxonomy document for the team listing every change category as breaking, non-breaking, or potentially-breaking with examples.
2. Integrate `oasdiff` or equivalent schema diffing in CI to catch structural breaking changes on every PR against the API spec.
3. Implement consumer-driven contract tests with Pact for all known consumers, run against every API deployment.
4. Apply Postel's Law to input parsing: configure request deserialization to ignore unknown fields rather than reject them.
5. Run `harness validate` to confirm skill files are well-formed and related skills are correctly cross-referenced.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** api-deprecation-strategy, api-versioning-url, api-versioning-header, api-contract-testing

## Success Criteria

- A published breaking-change taxonomy document exists and is referenced in the API style guide.
- Automated schema diffing runs on every PR that touches the API spec and fails the build on breaking changes.
- All request parsers ignore unknown fields (lenient deserialization) rather than rejecting them.
- Consumer-driven contract tests exist for all known consumers and run against the provider in CI.
- New enum values in responses are announced with advance notice and documentation recommends default-case handling for unknown values.
