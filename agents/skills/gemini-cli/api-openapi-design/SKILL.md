# API OpenAPI Design

> CONTRACT-FIRST OPENAPI 3.1 DESIGN TREATS THE SPECIFICATION AS THE SINGLE SOURCE OF TRUTH — SCHEMAS DEFINED ONCE IN COMPONENTS AND REFERENCED EVERYWHERE, DISCRIMINATORS THAT MAKE POLYMORPHISM EXPLICIT, AND OPERATION IDS THAT DRIVE CONSISTENT CODE GENERATION ACROSS EVERY CLIENT LANGUAGE — SO THE CONTRACT IS NEVER AN AFTERTHOUGHT BOLTED ONTO A RUNNING SERVER.

## When to Use

- Starting a new API and choosing whether to write the spec first or derive it from code
- Designing schemas that appear in multiple request and response bodies and need a single canonical definition
- Modeling a polymorphic payload (e.g., a `PaymentMethod` that is either a `Card`, `BankAccount`, or `Wallet`) without duplicating fields across every variant
- Setting `operationId` values that code generators and documentation tools use to name methods and pages
- Adding async event streams (webhooks, Kafka topics) to an API that already has REST endpoints and needs both documented in one place
- Integrating spectral linting or a code-generation pipeline into CI so the spec is validated and clients are regenerated on every merge
- Writing the API design review checklist for a platform team that owns multiple services

## Instructions

### Key Concepts

1. **Contract-first vs. code-first** — Contract-first means you write the OpenAPI YAML before writing any server code. The spec is committed to version control, reviewed like code, and used to generate server stubs and client SDKs. Code-first derives the spec from annotations or reflection at runtime. Contract-first wins when multiple teams consume the API (they can build clients before the server ships), when you need breaking-change review in pull requests, and when you want deterministic `operationId` values. Code-first is acceptable for internal services with a single consumer. Stripe, Twilio, and GitHub all publish hand-authored contract-first specs.

2. **Schema reuse with `$ref` and `components`** — Every named type belongs in `components/schemas` and is referenced via `$ref: '#/components/schemas/TypeName'` everywhere it is used. Never inline a schema that appears in more than one location. Benefits: a rename or field addition is made in one place; validators and code generators produce a single class per type; documentation renders one canonical schema page. Group related components: `components/schemas` for data types, `components/parameters` for reusable query/path/header parameters, `components/responses` for shared response envelopes (e.g., `404NotFound`, `ValidationError`), and `components/requestBodies` for shared request shapes.

3. **Discriminator for polymorphism** — When a field can be one of several object types (a union), use `oneOf` with a `discriminator` block. The `discriminator.propertyName` names the field consumers read to determine the concrete type; `discriminator.mapping` maps each value to a `$ref`. Without a discriminator, code generators produce untyped `anyOf` unions that require manual casting. Example: a `PaymentMethod` with `type: card | bank_account | wallet` uses `discriminator: { propertyName: type, mapping: { card: '#/components/schemas/Card', bank_account: '#/components/schemas/BankAccount', wallet: '#/components/schemas/Wallet' } }`. Every concrete schema must include the discriminator property as a required field.

4. **`operationId` naming conventions** — Every operation must have a unique `operationId` in `verb-noun` or `verb_noun` format that reads as a method name in code. Use the format `{action}{Resource}` in PascalCase for code generators: `CreatePayment`, `ListInvoices`, `GetCustomer`, `DeleteWebhook`, `UpdateSubscription`. Avoid generic names like `getAll` or `post1`. The `operationId` becomes the method name in generated SDKs, the anchor in documentation, and the identifier in test suites. A consistent convention across all operations in a spec makes generated clients feel idiomatic.

5. **AsyncAPI for event-driven APIs** — AsyncAPI 2.x / 3.x is the OpenAPI equivalent for message-based systems (Kafka, AMQP, WebSocket, webhooks). Where OpenAPI describes request/response channels, AsyncAPI describes publish/subscribe channels: the `channels` block maps topic names to `publish` and `subscribe` operations, each with a `message` schema defined in `components/messages`. A platform API that exposes both REST endpoints and Kafka events should maintain two specs: one OpenAPI and one AsyncAPI, with shared schema `$ref`s pointing to a common `schemas/` directory so data types are not duplicated between them.

6. **Code generation integration** — Use `openapi-generator-cli` or `oapi-codegen` (Go) in CI to regenerate client SDKs from the spec on every merge to the main branch. The generated output is committed to the repository; a diff in CI fails the build if the spec changed but the generated code was not regenerated. This guarantees that client libraries are always in sync with the spec. Configure a `.openapi-generator-ignore` file to protect hand-written files (custom auth layers, retry wrappers) from being overwritten by the generator.

### Worked Example

**Stripe-style Payment Intent API — contract-first OpenAPI 3.1**

```yaml
openapi: '3.1.0'
info:
  title: Payments API
  version: '2024-04-10'

paths:
  /payment_intents:
    post:
      operationId: CreatePaymentIntent
      summary: Create a PaymentIntent
      requestBody:
        required: true
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/CreatePaymentIntentRequest'
      responses:
        '201':
          description: PaymentIntent created
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PaymentIntent'
        '422':
          $ref: '#/components/responses/ValidationError'

  /payment_intents/{id}:
    get:
      operationId: GetPaymentIntent
      parameters:
        - $ref: '#/components/parameters/ResourceId'
      responses:
        '200':
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/PaymentIntent'
        '404':
          $ref: '#/components/responses/NotFound'

components:
  parameters:
    ResourceId:
      name: id
      in: path
      required: true
      schema:
        type: string

  schemas:
    CreatePaymentIntentRequest:
      type: object
      required: [amount, currency, payment_method]
      properties:
        amount:
          type: integer
          description: Amount in smallest currency unit (cents)
          example: 1099
        currency:
          type: string
          example: usd
        payment_method:
          $ref: '#/components/schemas/PaymentMethod'

    PaymentMethod:
      oneOf:
        - $ref: '#/components/schemas/CardPaymentMethod'
        - $ref: '#/components/schemas/BankAccountPaymentMethod'
      discriminator:
        propertyName: type
        mapping:
          card: '#/components/schemas/CardPaymentMethod'
          bank_account: '#/components/schemas/BankAccountPaymentMethod'

    CardPaymentMethod:
      type: object
      required: [type, number, exp_month, exp_year]
      properties:
        type:
          type: string
          enum: [card]
        number:
          type: string
        exp_month:
          type: integer
        exp_year:
          type: integer

    BankAccountPaymentMethod:
      type: object
      required: [type, routing_number, account_number]
      properties:
        type:
          type: string
          enum: [bank_account]
        routing_number:
          type: string
        account_number:
          type: string

    PaymentIntent:
      type: object
      required: [id, amount, currency, status, created]
      properties:
        id:
          type: string
          example: pi_3NqXxx
        amount:
          type: integer
        currency:
          type: string
        status:
          type: string
          enum: [requires_payment_method, requires_confirmation, processing, succeeded, canceled]
        created:
          type: string
          format: date-time

  responses:
    ValidationError:
      description: Validation failed
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'
    NotFound:
      description: Resource not found
      content:
        application/json:
          schema:
            $ref: '#/components/schemas/Error'

    Error:
      type: object
      required: [code, message]
      properties:
        code:
          type: string
        message:
          type: string
```

### Anti-Patterns

1. **Inlining schemas instead of using `$ref`.** When `CreatePaymentRequest` and `UpdatePaymentRequest` both inline the same address object, a field addition requires two edits. The types diverge silently. Every named type used in more than one location belongs in `components/schemas`.

2. **Missing or generic `operationId` values.** An `operationId` of `post_payment` or `get1` generates a method named `post_payment()` in every SDK. Consumers cannot discover intent from the name. Use `CreatePayment` and `GetPayment` — the generator produces a method whose name reads like a sentence.

3. **Using `anyOf` without a discriminator for union types.** `anyOf` without a discriminator property produces an untyped union in generated code. Consumers must manually inspect the payload to determine the concrete type. Add a `discriminator.propertyName` and `discriminator.mapping` to every `oneOf`/`anyOf` that represents a tagged union.

4. **Not versioning the spec file.** Placing the OpenAPI spec in a repo without a version field (or keeping `version: 0.0.1` forever) means consumers cannot detect when breaking changes were introduced. The `info.version` should match the API release version and be updated on every breaking change.

5. **Skipping linting in CI.** A spec that is never linted accumulates style violations, missing descriptions, and undocumented error responses. Add a spectral or vacuum lint step to CI that enforces the team's ruleset; block merges on lint errors, not just YAML parse failures.

## Details

### AsyncAPI Side-by-Side with OpenAPI

A payments platform that exposes REST endpoints AND publishes `payment.succeeded` events to Kafka maintains two specs:

```
specs/
  openapi.yaml        ← REST paths, operations, HTTP schemas
  asyncapi.yaml       ← Kafka topics, message schemas
  schemas/
    PaymentIntent.yaml  ← shared via $ref from both specs
    Error.yaml
```

Both specs `$ref` into `schemas/` for shared types. The AsyncAPI `channels` block:

```yaml
channels:
  payment.succeeded:
    publish:
      message:
        $ref: '#/components/messages/PaymentSucceeded'
components:
  messages:
    PaymentSucceeded:
      payload:
        $ref: '../../schemas/PaymentIntent.yaml'
```

This means the `PaymentIntent` schema is defined exactly once. REST consumers and event consumers share the same generated type.

### Real-World Case Study: GitHub's OpenAPI Spec

GitHub maintains a public contract-first OpenAPI spec for their REST API (`github/rest-api-description`). The spec has over 900 operations with consistent `operationId` values in the format `{category}/{action}` (e.g., `repos/create-for-authenticated-user`). Key outcomes:

- Third-party SDK generators (octokit, PyGithub) consume the spec directly — GitHub does not maintain those clients
- The spec is the authoritative documentation source; the developer portal renders from it
- Breaking changes are detectable via diff against the previous version in CI

GitHub's approach demonstrated that a large, complex API (900+ operations) can be fully described contract-first with consistent conventions, enabling an ecosystem of generated tooling without GitHub maintaining any of it directly.

## Source

- [OpenAPI Specification 3.1.0](https://spec.openapis.org/oas/v3.1.0)
- [AsyncAPI Specification 2.6](https://www.asyncapi.com/docs/reference/specification/v2.6.0)
- [Stripe OpenAPI Spec (github.com/stripe/openapi)](https://github.com/stripe/openapi)
- [GitHub REST API Description (github.com/github/rest-api-description)](https://github.com/github/rest-api-description)
- [OpenAPI Generator Documentation](https://openapi-generator.tech/docs/usage)

## Process

1. Define `components/schemas` for all domain types before writing any `paths` — the schema vocabulary is established first and paths reference it.
2. Write each path operation with a unique `operationId` in `{Verb}{Resource}` PascalCase; add `summary` and at least one error response per operation.
3. Model all union types with `oneOf` + `discriminator`; verify every concrete schema includes the discriminator property as required.
4. Run spectral or vacuum lint against the spec in CI; treat lint errors as build failures.
5. Run `harness validate` to confirm skill files are well-formed and related skills are correctly cross-referenced.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** api-contract-testing, api-error-contracts, api-backward-compatibility, api-validation-errors

## Success Criteria

- All named types appear in `components/schemas` and are referenced via `$ref`; no inline schema is duplicated across two or more locations.
- Every operation has a unique `operationId` in `{Verb}{Resource}` PascalCase format that produces a readable method name in generated SDKs.
- All polymorphic fields use `oneOf` with a `discriminator.propertyName` and `discriminator.mapping`; every concrete schema includes the discriminator field as required.
- A spectral or vacuum lint step runs in CI and blocks merges on ruleset violations.
- Shared domain types referenced by both REST and async event specs live in a common `schemas/` directory, not duplicated in each spec.
