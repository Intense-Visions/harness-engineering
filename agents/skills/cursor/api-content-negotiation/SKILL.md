# Content Negotiation

> CONTENT NEGOTIATION IS THE HTTP MECHANISM BY WHICH CLIENTS AND SERVERS AGREE ON THE FORMAT, LANGUAGE, AND ENCODING OF A RESPONSE — ENABLING A SINGLE ENDPOINT TO SERVE JSON, XML, CSV, OR VERSIONED MEDIA TYPES WITHOUT SEPARATE URLS. IGNORING CONTENT NEGOTIATION FORCES VERSIONING THROUGH URLS OR QUERY PARAMETERS AND MAKES FORMAT DISCOVERY OPAQUE.

## When to Use

- Designing an API endpoint that must serve multiple response formats (JSON, XML, CSV)
- Implementing media-type-based API versioning (`application/vnd.myapp.v2+json`)
- Diagnosing a `406 Not Acceptable` error from a client or proxy
- Deciding between URL versioning (`/v2/users`) and header versioning (`Accept: application/vnd.api.v2+json`)
- Supporting internationalized responses where language selection matters
- Building a public API where clients may request compressed or alternative encodings
- Reviewing a PR that hardcodes `Content-Type: application/json` without honoring the `Accept` header
- Configuring a reverse proxy or CDN to vary caching by `Accept` header

## Instructions

### Key Concepts

1. **Accept Header (Client-Driven Negotiation)** — The client advertises acceptable response media types in order of preference using quality factors (`q=`). The server selects the best match and responds with the chosen type in `Content-Type`. If no acceptable type is available, the server returns `406 Not Acceptable`.

   ```http
   GET /reports/q1-2024
   Accept: text/csv;q=0.9, application/json;q=1.0, */*;q=0.1
   ```

   The server reads this as: JSON preferred (`q=1.0`), CSV acceptable (`q=0.9`), anything else as last resort.

2. **Content-Type Header** — Declares the media type of the request body (on POST/PUT/PATCH) or response body. The client sets it on requests with bodies; the server sets it on responses. Mismatch between declared and actual type causes parsing failures.

   ```http
   POST /events
   Content-Type: application/json

   { "type": "order.completed", "orderId": "ord_123" }
   ```

3. **Media Types and Vendor Types** — Media types follow the pattern `type/subtype[+suffix][;parameter]`. Vendor types (`application/vnd.*`) allow APIs to declare version-specific or format-specific contracts. For example, `application/vnd.github.v3+json` is GitHub's versioned JSON type. The `+json` suffix tells generic parsers they can treat the body as JSON even without specific type knowledge.

4. **Quality Factors (q values)** — Values from `0.0` to `1.0` indicating relative preference. Default is `1.0`. `q=0` means "not acceptable." Used in `Accept`, `Accept-Language`, `Accept-Encoding`, and `Accept-Charset` headers. Servers must implement negotiation logic that respects q-value ordering.

   ```
   Accept: application/json;q=1.0, application/xml;q=0.8, text/plain;q=0.5
   ```

5. **Vary Header** — Tells downstream caches (CDNs, proxies, browsers) which request headers were used in content negotiation. A response that varies by `Accept` must include `Vary: Accept`. Without this, a CDN may serve a JSON response to a client requesting CSV if both requests hit the same cache key.

   ```http
   HTTP/1.1 200 OK
   Content-Type: application/json
   Vary: Accept, Accept-Language
   ```

6. **Accept-Encoding and Compression** — Clients declare supported compression algorithms; servers respond with compressed bodies and `Content-Encoding` headers. `gzip` and `br` (Brotli) are the most common. Compression negotiation is separate from format negotiation.

   ```http
   GET /large-dataset
   Accept-Encoding: br, gzip;q=0.8
   ```

   ```http
   HTTP/1.1 200 OK
   Content-Encoding: br
   Content-Type: application/json
   ```

### Worked Example

GitHub's API demonstrates media-type versioning through content negotiation. GitHub uses `Accept` headers both for version selection and for enabling preview features:

**Request the default v3 JSON response:**

```http
GET /repos/octocat/hello-world
Authorization: Bearer ghp_...
Accept: application/vnd.github.v3+json
```

```http
HTTP/1.1 200 OK
Content-Type: application/vnd.github.v3+json
Vary: Accept, Authorization
X-GitHub-Media-Type: github.v3; format=json

{
  "id": 1296269,
  "name": "hello-world",
  "full_name": "octocat/hello-world",
  ...
}
```

**Request raw file content (format negotiation, same endpoint):**

```http
GET /repos/octocat/hello-world/contents/README.md
Accept: application/vnd.github.raw+json
```

```http
HTTP/1.1 200 OK
Content-Type: text/plain
Vary: Accept

# Hello World
...
```

**Enable a preview feature via Accept header (GitHub Reaction preview):**

```http
GET /repos/octocat/hello-world/issues/1
Accept: application/vnd.github.squirrel-girl-preview+json
```

The same URL returns an augmented response with `reactions` field when the preview media type is requested. This is GitHub's mechanism for progressive feature rollout without URL proliferation.

**406 Not Acceptable — requesting an unsupported type:**

```http
GET /repos/octocat/hello-world
Accept: application/x-yaml
```

```http
HTTP/1.1 406 Not Acceptable
Content-Type: application/json

{ "message": "Must accept 'application/vnd.github.v3+json'" }
```

### Anti-Patterns

1. **Ignoring the Accept header and always returning JSON.** A server that returns `Content-Type: application/json` regardless of the `Accept` header breaks negotiation. If the client requests `Accept: application/xml` and receives JSON, it either rejects the response or silently parses wrong data. Fix: check the `Accept` header, return the negotiated type, and return `406 Not Acceptable` if no acceptable type is available.

2. **URL-based format selection instead of content negotiation.** Adding `/users.json` and `/users.xml` as separate endpoints duplicates routing, skips the `Vary` header (breaking CDN cache correctness), and adds URL surface area. HTTP already provides the mechanism: use `Accept` headers and vary cache responses accordingly.

3. **Omitting the Vary header on negotiated responses.** A CDN that caches a JSON response without seeing `Vary: Accept` will serve that cached JSON to all subsequent requests for the same URL — including clients requesting CSV. The `Vary` header is mandatory whenever response content differs based on request headers.

4. **Media-type versioning without a default.** If an API requires `Accept: application/vnd.myapp.v2+json` but provides no fallback for plain `Accept: application/json`, existing clients that omit the vendor type receive a `406`. Always define a default version for generic JSON requests, documented in the API contract.

## Details

### Media-Type Versioning vs. URL Versioning

| Approach       | Example                               | Pros                          | Cons                                    |
| -------------- | ------------------------------------- | ----------------------------- | --------------------------------------- |
| URL versioning | `/v2/users`                           | Simple, visible, bookmarkable | URL proliferation, breaking resources   |
| Query param    | `/users?version=2`                    | Simple                        | Caching issues, not RESTful             |
| Accept header  | `Accept: application/vnd.api.v2+json` | Clean URLs, proper HTTP       | Less visible, harder to test in browser |
| Custom header  | `Api-Version: 2`                      | Simple                        | Non-standard, not cached by `Vary`      |

Media-type versioning via `Accept` is the most RESTful but requires CDN and proxy configuration for correct `Vary` handling. Most public APIs (Stripe, GitHub, Twilio) choose URL versioning for its simplicity and developer experience.

### Real-World Case Study: Twilio Content Negotiation

Twilio's REST API accepts both `application/json` and `application/x-www-form-urlencoded` on request bodies (via `Content-Type`) and returns JSON by default. When Twilio added support for CSV exports on call logs, they used content negotiation rather than a separate `/export` endpoint:

```http
GET /2010-04-01/Accounts/{AccountSid}/Calls.json
Accept: text/csv
```

Returns a CSV download of the same resource. The `Vary: Accept` header ensures CDN caches do not mix JSON and CSV responses. This avoided a URL proliferation problem that had plagued the earlier `/Calls.json` vs `/Calls.xml` pattern (which duplicated the file-extension suffix hack).

## Source

- [MDN — Content Negotiation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Content_negotiation)
- [RFC 9110 — HTTP Semantics, Section 12](https://www.rfc-editor.org/rfc/rfc9110#section-12)
- [RFC 6838 — Media Type Specifications and Registration Procedures](https://www.rfc-editor.org/rfc/rfc6838)
- [MDN — Accept Header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Accept)
- [MDN — Vary Header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Vary)

## Process

1. Identify which dimensions of content negotiation are needed: format (JSON/XML/CSV), version (vendor type), language, and encoding.
2. Implement `Accept` header parsing in the server: parse quality factors, find the best match against supported types, return `406` if no match.
3. Set `Content-Type` in every response to the exact negotiated media type (including vendor type if applicable).
4. Add `Vary` headers listing all request headers used in negotiation (`Accept`, `Accept-Language`, `Accept-Encoding`).
5. Run `harness validate` to confirm skill files are well-formed.

## Harness Integration

- **Type:** knowledge -- this skill is a reference document, not a procedural workflow.
- **No tools or state** -- consumed as context by other skills and agents.
- **related_skills:** api-versioning-header, api-http-caching, api-openapi-design

## Success Criteria

- The server parses the `Accept` header and returns the best-match media type in `Content-Type`.
- `406 Not Acceptable` is returned when no client-acceptable type is available.
- Every response whose content varies by a negotiated header includes an accurate `Vary` header listing those headers.
- Media-type versioning uses vendor types (`application/vnd.*+json`) and documents a default for generic `application/json` requests.
- `Accept-Encoding` is honored for compression, with `Content-Encoding` set in compressed responses.
