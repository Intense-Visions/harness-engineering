# API SDK Ergonomics

> AN ERGONOMIC SDK REMOVES EVERY DECISION A DEVELOPER SHOULD NOT HAVE TO MAKE — METHOD NAMES THAT READ AS SENTENCES, PAGINATION THAT ITERATES WITHOUT MANUAL CURSOR MANAGEMENT, TYPED EXCEPTIONS THAT DISTINGUISH RETRIABLE ERRORS FROM PERMANENT ONES, AND RETRY LOGIC BUILT IN BY DEFAULT — SO THE DEVELOPER'S FIRST WORKING INTEGRATION TAKES MINUTES AND THE SDK STAYS INVISIBLE IN PRODUCTION.

## When to Use

- Designing the public client library API for a new platform or SaaS product
- Auditing an existing SDK for usability problems: opaque error types, manual pagination, inconsistent method naming, or missing retry logic
- Choosing between typed exceptions and error objects for representing API errors in a typed language
- Adding auto-pagination helpers to an SDK that currently forces callers to manage cursors manually
- Writing the SDK design guide for a developer platform team that ships clients in multiple languages
- Reviewing a pull request that introduces a new resource type and needs idiomatic method names for CRUD operations
- Evaluating an SDK against a competitor (e.g., Stripe vs. Braintree) for developer experience reference

## Instructions

### Key Concepts

1. **Method naming: verb-noun in idiomatic form** — SDK methods should read as imperative sentences: `client.payments.create(...)`, `client.invoices.list(...)`, `client.customers.get(id)`, `client.subscriptions.cancel(id)`. The verb names the action (create, list, get, update, delete, cancel, archive); the noun names the resource (the namespace or class the method lives on). Avoid generic names like `send()`, `fetch()`, `call()`, or `execute()` — they say nothing about intent. In object-oriented languages, resource classes act as namespaces: `stripe.PaymentIntents.Create(params)` in Go, `stripe.payment_intents.create(params)` in Python. The naming convention must be consistent across all resources; inconsistency (some using `retrieve`, others using `get`) forces developers to consult documentation for every resource.

2. **Pagination helpers: auto-cursor iteration** — An API that uses cursor-based pagination should not expose cursor management to the caller. The SDK wraps the raw paginated endpoint in an iterator or async generator that fetches the next page transparently when the caller exhausts the current page. In Python: `for invoice in client.invoices.list(customer='cus_xxx'):` fetches page 1, then page 2 when the iterator is exhausted, and so on. The caller never sees a cursor, a `has_more` flag, or a `next_page` token. Stripe's Python SDK (`.auto_paging_iter()`), GitHub's Octokit (`.paginate()`), and Twilio's Python SDK (`.stream()`) all implement this pattern. Expose the raw paginated method alongside the iterator for callers who need explicit page control.

3. **Error surface: typed exceptions vs. error objects** — In strongly typed languages, API errors should be represented as a hierarchy of typed exceptions or error types, not as a generic `Error` with a string message. A base `ApiError` carries `status_code`, `error_code`, and `message`; subclasses specialize by category: `AuthenticationError` (401), `PermissionError` (403), `NotFoundError` (404), `RateLimitError` (429), `InvalidRequestError` (422), `ServiceUnavailableError` (5xx). Callers catch the specific type they can handle and let others propagate: `except stripe.RateLimitError: time.sleep(backoff); retry()`. An SDK that throws a single `ApiException` with a numeric status code forces callers to write switch statements on integers — a leaky abstraction that puts provider implementation details into every caller.

4. **Retry built-ins** — Transient failures (rate limits, 503 Service Unavailable, network timeouts) should be retried automatically by the SDK with exponential backoff and jitter, not left to the caller. The default retry policy: up to 2 retries on `RateLimitError` (429) and `ServiceUnavailableError` (5xx) with 1s × 2^attempt + random jitter. Callers opt out via `max_retries=0`; power users override the policy. A request that requires explicit idempotency (POST with a side effect) should require an idempotency key from the caller before retrying — never silently retry non-idempotent requests. Document clearly which methods the SDK retries automatically and which require a caller-supplied idempotency key.

5. **Discoverability** — An SDK is discoverable when a developer can find the right method without leaving their IDE. Design for discoverability: resource namespaces are the top-level entry points (`client.payments`, `client.customers`), method names match the operation names in the API reference, and parameter objects use named fields (not positional arguments) so autocomplete shows what is required. Include docstrings/JSDoc on every public method with the parameter names, types, return type, and a link to the API reference. A developer who can tab-complete their way to the first working call in under five minutes will not reach for a competitor SDK.

6. **Idiomatic patterns per language** — The same SDK concept is expressed differently across languages. Pagination: Python uses a generator, Go uses an iterator struct with `Next() bool`, JavaScript uses an async iterator. Configuration: Python uses keyword arguments, Go uses a functional options pattern (`WithTimeout(10 * time.Second)`), Java uses a builder. Error handling: Python uses exceptions, Go uses `(result, error)` tuples, Rust uses `Result<T, E>`. An SDK that forces Go developers to use a Python-style exception pattern (panics) or forces Python developers to check error return values is fighting the language. Implement each language variant idiomatically; accept that the implementations diverge.

### Worked Example

**Stripe Python SDK — idiomatic patterns across all six concepts**

```python
import stripe

# Configuration — idiomatic keyword arguments, not a config object
stripe.api_key = "sk_live_..."
client = stripe.StripeClient(api_key="sk_live_...", max_network_retries=2)

# Method naming — verb-noun, resource namespaced
# client.{resource}.{action}(params)
intent = client.payment_intents.create(
    params={
        "amount": 1099,
        "currency": "usd",
        "automatic_payment_methods": {"enabled": True},
    }
)
# → PaymentIntent(id='pi_3Nq...', status='requires_payment_method', amount=1099)

# Typed error surface — catch the specific type you can handle
try:
    intent = client.payment_intents.confirm("pi_xxx", params={"payment_method": "pm_xxx"})
except stripe.error.CardError as e:
    # Permanent failure — user's card was declined, do not retry
    handle_declined_card(e.user_message)
except stripe.error.RateLimitError:
    # Transient — SDK retried automatically, this is post-retry failure
    enqueue_for_later()
except stripe.error.AuthenticationError:
    # Config error — wrong API key, alert ops immediately
    alert_ops("invalid Stripe API key")
# stripe.error.CardError, RateLimitError, AuthenticationError, PermissionError,
# InvalidRequestError, APIConnectionError, APIError all inherit from stripe.error.StripeError

# Auto-pagination — no cursor management in caller code
for invoice in client.invoices.list(params={"customer": "cus_xxx"}).auto_paging_iter():
    process_invoice(invoice)
# SDK fetches page 1 (default limit 10), then fetches page 2 when exhausted, etc.
# Caller never sees starting_after, has_more, or next page token

# Built-in retry — SDK retries 429 and 5xx automatically (max_network_retries=2)
# For POST with side effects, supply idempotency key so retry is safe
intent = client.payment_intents.create(
    params={"amount": 1099, "currency": "usd"},
    options={"idempotency_key": f"create-intent-{order_id}"},
)
```

**GitHub Octokit.js — auto-pagination with async iterator**

```javascript
import { Octokit } from '@octokit/rest';
const octokit = new Octokit({ auth: 'ghp_token' });

// Manual pagination — explicit page management (avoid this pattern)
const page1 = await octokit.rest.issues.listForRepo({ owner: 'acme', repo: 'api', per_page: 100 });
// caller must check page1.headers.link for next page cursor

// Auto-pagination — SDK manages cursor transparently
for await (const { data: issues } of octokit.paginate.iterator(octokit.rest.issues.listForRepo, {
  owner: 'acme',
  repo: 'api',
  state: 'open',
  per_page: 100,
})) {
  for (const issue of issues) {
    processIssue(issue);
  }
}
// Fetches all pages; caller iterates all issues without cursor logic
```

**Go functional options — idiomatic configuration**

```go
// stripe-go: functional options for per-request configuration
params := &stripe.PaymentIntentCreateParams{
    Amount:   stripe.Int64(1099),
    Currency: stripe.String("usd"),
}
// Per-request option: idempotency key
params.SetIdempotencyKey(fmt.Sprintf("create-intent-%s", orderID))
// Per-request option: custom timeout
params.Context = context.WithTimeout(ctx, 10*time.Second)

intent, err := paymentintent.New(params)
if err != nil {
    var stripeErr *stripe.Error
    if errors.As(err, &stripeErr) {
        switch stripeErr.Code {
        case stripe.ErrorCodeCardDeclined:
            return handleDeclined(stripeErr.DeclineCode)
        case stripe.ErrorCodeRateLimitExceeded:
            return retryWithBackoff(...)
        }
    }
    return err
}
```

### Anti-Patterns

1. **Positional parameters for resources with many fields.** `client.create_payment(1099, "usd", "pm_xxx", nil, nil, true, false)` requires counting argument positions to know what `nil` means. Named parameter objects or keyword arguments are mandatory for any method with more than two parameters; they enable tab-complete, make call sites self-documenting, and prevent positional errors when new optional fields are added.

2. **Exposing raw HTTP response objects.** An SDK method that returns `{ status: 200, headers: {...}, body: { id: 'pi_xxx', ... } }` forces callers to unwrap the HTTP envelope on every call. The SDK should return the domain object (`PaymentIntent`) directly; HTTP metadata (request ID, rate limit headers) should be accessible via a sidecar method or response envelope wrapper, not as the primary return value.

3. **Silent retry of non-idempotent requests.** Retrying a `POST /charges` without an idempotency key creates a duplicate charge. An SDK that silently retries all POST requests on 5xx is creating money-movement bugs in production. Retry only GET and DELETE automatically; require an explicit idempotency key for POST, PUT, and PATCH operations before including them in the automatic retry scope, or document clearly that POST retries are disabled by default.

4. **One giant `client.request(method, path, params)` method.** Some SDKs expose a single generic method and document it as "flexible." This approach is an undifferentiated wrapper around HTTP — it provides no method naming, no type safety, no parameter validation, and no discoverability. Every caller must memorize path strings and HTTP verbs. Wrap specific operations in specific named methods even if the underlying implementation calls a shared HTTP layer.

## Details

### SDK as Product: Measuring Developer Experience

SDK ergonomics is measurable. Time-to-first-call (TTFC) — the elapsed time from "I just installed the SDK" to "I have a working API response in my application" — is the primary metric. Stripe's internal target for TTFC on their Python SDK is under 10 minutes for a new developer with no prior Stripe experience. The design decisions that minimize TTFC:

- Authentication is a single assignment (`stripe.api_key = "..."` or constructor parameter), not a five-step OAuth flow
- The first operation a developer needs (`create` a resource) is the first method shown in the quickstart
- Errors from the first call include the documentation URL for the specific error code, not just a numeric status

A secondary metric is exception-to-fix time (ETFT): when a developer hits an error, how quickly can they understand and resolve it? Typed exceptions with human-readable `user_message` fields and documentation links reduce ETFT from hours to minutes.

### Real-World Case Study: Stripe SDK Design Principles

Stripe's engineering blog post "Designing robust and predictable APIs with idempotency" and their public SDK repositories document the principles behind the Stripe SDK experience. Key outcomes from their SDK design choices:

- Auto-pagination on list methods eliminated a class of bug where developers fetched only the first page and processed incomplete data sets — Stripe's support logs showed this was among the top 5 developer errors before auto-pagination was introduced
- Typed exceptions (`CardError`, `RateLimitError`) reduced the volume of "how do I handle a declined card" support tickets by making the answer discoverable from the exception type itself
- Built-in retry with idempotency keys removed the need for the majority of developers to write their own retry logic, which historically was the most common source of duplicate-charge bugs

The Stripe SDK design became the benchmark against which most API platform SDKs are evaluated, including Twilio, Plaid, and Braintree.

## Source

- [Stripe Developer Experience Blog — Payment API Design](https://stripe.com/blog/payment-api-design)
- [Stripe Python SDK (github.com/stripe/stripe-python)](https://github.com/stripe/stripe-python)
- [GitHub Octokit.js — Pagination](https://octokit.github.io/rest.js/v20#pagination)
- [Stripe Go SDK — Functional Options Pattern](https://github.com/stripe/stripe-go)
- [Joshua Bloch — API Design Matters (2006 Google TechTalk)](https://www.youtube.com/watch?v=aAb7hSCtvGw)

## Process

1. Define the resource namespace hierarchy (`client.payments`, `client.invoices`) and the method vocabulary (`create`, `list`, `get`, `update`, `delete`) before writing any implementation.
2. Design the error type hierarchy from the API's error catalog: base error type, then subclasses per HTTP status category; ensure each subclass carries structured fields (`error_code`, `user_message`, `doc_url`).
3. Implement auto-pagination iterators/generators for every list endpoint; expose the raw paginated method as a fallback but default to the iterator in quickstart examples.
4. Add built-in retry with exponential backoff for 429 and 5xx on idempotent methods; require explicit idempotency keys before enabling retry for POST operations with side effects.
5. Run `harness validate` to confirm skill files are well-formed and related skills are correctly cross-referenced.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** api-deprecation-strategy, api-error-contracts, api-pagination-cursor, api-retry-guidance

## Success Criteria

- Every resource has a namespace (`client.{resource}`) and methods follow `{verb}{Resource}` or `client.{resource}.{verb}` naming with no generic verbs.
- All list endpoints have an auto-pagination iterator that manages cursor state transparently; callers never write cursor-handling loops.
- The error type hierarchy has at least one subclass per HTTP status category (4xx client, 429 rate limit, 5xx server); each subclass is separately catchable.
- Built-in retry is enabled by default for GET and idempotent operations; POST retry requires an explicit idempotency key.
- Every public method has a docstring with parameter names, types, return type, and a link to the API reference documentation.
