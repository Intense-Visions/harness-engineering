# API Contract Testing

> CONSUMER-DRIVEN CONTRACT TESTING INVERTS THE TRADITIONAL INTEGRATION TEST — EACH CONSUMER PUBLISHES THE EXACT SHAPE IT EXPECTS, THE PROVIDER VERIFIES AGAINST EVERY CONSUMER'S CONTRACT IN CI, AND A BREAKING CHANGE IS CAUGHT THE MOMENT IT IS INTRODUCED INTO THE PROVIDER CODEBASE RATHER THAN DISCOVERED AT DEPLOYMENT TIME WHEN ROLLING BACK COSTS HOURS.

## When to Use

- Adding a new API consumer (frontend, mobile, partner service) and formalizing what shape it expects from the provider
- Running a provider code change through CI and needing proof that no existing consumer contract is broken before merging
- Integrating spectral or vacuum schema linting into a CI pipeline for an OpenAPI spec that has no automated quality gate today
- Evaluating `oasdiff` or `openapi-diff` for automated breaking-change detection between two versions of a spec
- Replacing a brittle end-to-end integration test suite with faster, isolated contract tests that do not require a live environment
- Writing the API governance checklist for a platform team that ships multiple versioned services
- Onboarding a new team to consumer-driven contract practices before they begin building their first provider

## Instructions

### Key Concepts

1. **Consumer-driven contracts** — A consumer-driven contract captures the exact subset of the provider API that a specific consumer uses: the request shape it sends and the minimum response fields it requires. The consumer publishes this contract as a Pact file (JSON); the provider runs the Pact file against its real implementation in CI. If the provider's response no longer satisfies the consumer's contract, the provider build fails — before any deployment. This is the inverse of provider-driven testing, where the provider defines what it thinks consumers need and consumers adapt. Consumer-driven contracts give each consumer a voice in breaking-change detection.

2. **Pact fundamentals** — A Pact file is a JSON document that encodes one or more interactions: `{ "description": "a request for payment intent pi_xxx", "request": { "method": "GET", "path": "/payment_intents/pi_xxx" }, "response": { "status": 200, "body": { "id": "pi_xxx", "status": "succeeded" } } }`. The consumer writes the test using the Pact DSL (available in JavaScript, Python, Go, Java, Ruby, .NET); the DSL generates the Pact file and runs a mock provider during the consumer test. The provider test replays each interaction from the Pact file against the real provider, verifying response status, headers, and body match the consumer's expectations.

3. **Pact Broker and provider verification** — In a multi-team setup, Pact files are published to a Pact Broker (hosted at pactflow.io or self-hosted). The provider CI pipeline fetches all Pact files for the service, runs provider verification against each, and publishes results back to the Broker. The Broker's `can-i-deploy` command answers: "Is it safe to deploy provider version X to environment Y given the current consumer contracts?" This replaces manual coordination between teams before deployments.

4. **Schema linting with spectral and vacuum** — Spectral (Stoplight) and vacuum (quobix) are OpenAPI spec linters that enforce ruleset-based quality gates. Both support built-in rulesets (OpenAPI best practices) and custom rulesets (team conventions). A spectral rule that enforces `operationId` presence looks like: `{ "operation-operationId": { "given": "$.paths.*[get,post,put,patch,delete]", "then": { "field": "operationId", "function": "truthy" } } }`. Run linting in CI as a required check; a spec that adds a new operation without an `operationId` fails the build.

5. **Breaking change detection with oasdiff** — `oasdiff` compares two OpenAPI specs and classifies changes as breaking or non-breaking. Breaking changes include: removing a required request field, removing a response field a consumer may rely on, changing a field type, removing an operation. Non-breaking changes include: adding an optional request field, adding a response field, adding a new operation. Run `oasdiff breaking old-spec.yaml new-spec.yaml` in CI on every pull request that touches the spec; block merges on any breaking change unless a version bump accompanies it.

6. **Contract as living documentation** — A Pact Broker renders the consumer/provider relationship graph: which consumers depend on which providers, which contract versions are verified, which environments each version is deployed to. This replaces a manually maintained dependency map that goes stale. The Broker's network diagram is generated from actual test results, not documentation — if a consumer stops using an endpoint, its contract disappears from the graph automatically.

### Worked Example

**Pact consumer test — JavaScript (checkout-service consuming payments-api)**

```javascript
// checkout-service/src/payments.pact.test.js
import { PactV3, MatchersV3 } from '@pact-foundation/pact';

const { like, regex } = MatchersV3;

const provider = new PactV3({
  consumer: 'checkout-service',
  provider: 'payments-api',
  dir: './pacts',
});

describe('PaymentsAPI', () => {
  it('returns a succeeded PaymentIntent', async () => {
    await provider
      .given('payment intent pi_succeeded exists')
      .uponReceiving('a request for a succeeded payment intent')
      .withRequest({
        method: 'GET',
        path: '/payment_intents/pi_succeeded',
        headers: { Authorization: like('Bearer token') },
      })
      .willRespondWith({
        status: 200,
        body: {
          id: like('pi_succeeded'),
          status: regex('succeeded|processing', 'succeeded'),
          amount: like(1099),
          currency: like('usd'),
        },
      })
      .executeTest(async (mockServer) => {
        const client = new PaymentsClient(mockServer.url);
        const intent = await client.getPaymentIntent('pi_succeeded');
        expect(intent.status).toBe('succeeded');
      });
  });
});
```

Generated Pact file (`./pacts/checkout-service-payments-api.json`):

```json
{
  "consumer": { "name": "checkout-service" },
  "provider": { "name": "payments-api" },
  "interactions": [
    {
      "description": "a request for a succeeded payment intent",
      "providerStates": [{ "name": "payment intent pi_succeeded exists" }],
      "request": {
        "method": "GET",
        "path": "/payment_intents/pi_succeeded"
      },
      "response": {
        "status": 200,
        "body": { "id": "pi_succeeded", "status": "succeeded", "amount": 1099, "currency": "usd" }
      }
    }
  ]
}
```

**Provider verification — payments-api (Go)**

```go
// payments-api/contract_test.go
func TestPaymentsAPIProviderContract(t *testing.T) {
    verifier := provider.NewVerifier()
    err := verifier.VerifyProvider(t, provider.VerifyRequest{
        ProviderBaseURL:            "http://localhost:8080",
        BrokerURL:                  "https://broker.acme.com",
        BrokerToken:                os.Getenv("PACT_BROKER_TOKEN"),
        PublishVerificationResults: true,
        ProviderVersion:            os.Getenv("GIT_SHA"),
        StateHandlers: provider.StateHandlers{
            "payment intent pi_succeeded exists": func(setup bool, s provider.ProviderStateV3) (provider.ProviderStateV3Response, error) {
                if setup {
                    seedPaymentIntent("pi_succeeded", "succeeded")
                }
                return provider.ProviderStateV3Response{}, nil
            },
        },
    })
    assert.NoError(t, err)
}
```

**oasdiff in CI (GitHub Actions)**

```yaml
- name: Check for breaking API changes
  run: |
    oasdiff breaking \
      origin/main:specs/openapi.yaml \
      specs/openapi.yaml \
      --fail-on ERR
```

### Anti-Patterns

1. **Provider-written contracts.** If the provider team writes the Pact interactions on behalf of all consumers, the contract reflects what the provider thinks consumers need — not what they actually use. Consumer teams must write their own contracts against their real code paths. A contract written by the wrong team detects nothing.

2. **Testing the full response body instead of the minimum required fields.** A consumer test that asserts every field in the response will fail when the provider adds a new field — a non-breaking change triggers a false positive. Pact's `like()` and `eachLike()` matchers verify type and presence, not exact value; only assert the fields the consumer actually reads.

3. **Running contract tests against a live shared environment.** Contract tests should run against a locally started provider or a dedicated test instance. Running against a shared staging environment makes tests non-deterministic: other teams' changes, data drift, and network flakiness cause spurious failures that erode trust in the suite.

4. **Ignoring `can-i-deploy` before deployment.** Publishing a Pact file is not enough — the `can-i-deploy` check queries the Broker to confirm all consumer contracts are verified for the version being deployed to the target environment. Skipping this step allows a provider to deploy a version that has not been verified against the latest consumer contracts.

## Details

### Spectral Ruleset for API Governance

A team-level spectral ruleset enforces conventions across all services:

```yaml
# .spectral.yaml
extends: ['spectral:oas']
rules:
  operation-operationId-required:
    description: Every operation must have an operationId
    given: '$.paths.*[get,post,put,patch,delete,options,head]'
    severity: error
    then:
      field: operationId
      function: truthy

  operation-success-response:
    description: Every operation must have at least one 2xx response
    given: '$.paths.*[get,post,put,patch,delete]'
    severity: warn
    then:
      function: schema
      functionOptions:
        schema:
          type: object
          patternProperties:
            '^2[0-9]{2}$':
              type: object

  component-description:
    description: All schema components must have a description
    given: '$.components.schemas[*]'
    severity: warn
    then:
      field: description
      function: truthy
```

### Real-World Case Study: Atlassian Contract Testing at Scale

Atlassian runs Pact across 200+ microservices in the Jira/Confluence platform. Before adopting consumer-driven contracts, cross-team integration failures were discovered during monthly joint testing sprints, often requiring 3–5 days of debugging to isolate the breaking service. After adopting Pact with a centralized Pact Broker:

- Breaking changes are detected within the same CI run that introduces them — average detection time dropped from days to under 15 minutes
- The Broker's network graph replaced a manually maintained service dependency wiki page that was perpetually out of date
- Provider teams can refactor internal implementations freely as long as contracts pass; consumer teams can upgrade providers independently once `can-i-deploy` returns green

The key enabler was mandate: every service that exposes an HTTP API must publish and verify Pact contracts before its pipeline can deploy to staging.

## Source

- [Pact Documentation](https://docs.pact.io)
- [PactFlow CI/CD Setup Guide](https://docs.pactflow.io/docs/workshops/ci-cd)
- [Spectral OpenAPI Linter](https://stoplight.io/open-source/spectral)
- [oasdiff — OpenAPI Breaking Change Detection](https://github.com/Tufin/oasdiff)
- [Martin Fowler — Consumer-Driven Contracts](https://martinfowler.com/articles/consumerDrivenContracts.html)

## Process

1. Consumer team writes Pact interactions using only the fields their code reads; run the Pact test locally to generate the Pact file and verify the mock server interaction.
2. Publish the Pact file to the Pact Broker (via `pact-broker publish` or the Pact CLI) from the consumer's CI pipeline on every merge.
3. Provider CI fetches all consumer Pact files from the Broker, runs provider verification with state handlers seeding required data, and publishes results back to the Broker.
4. Add `oasdiff` and spectral lint as required CI checks on any pull request that modifies the OpenAPI spec; block merges on breaking changes or lint errors.
5. Run `harness validate` to confirm skill files are well-formed and related skills are correctly cross-referenced.

## Harness Integration

- **Type:** knowledge — this skill is a reference document, not a procedural workflow.
- **No tools or state** — consumed as context by other skills and agents.
- **related_skills:** api-openapi-design, api-backward-compatibility, api-versioning-url

## Success Criteria

- Every consumer service has at least one Pact file published to the Broker that covers its real API call paths.
- Provider CI runs Pact verification against all consumer contracts and publishes results; the build fails if any consumer contract is not satisfied.
- `oasdiff` runs on every pull request that modifies the OpenAPI spec and blocks merges on breaking changes without an accompanying version bump.
- spectral or vacuum lint runs in CI and enforces the team's ruleset with no rule violations on the main branch.
- `can-i-deploy` is invoked in the provider deployment pipeline before any environment promotion and blocks deployment when verification is incomplete.
