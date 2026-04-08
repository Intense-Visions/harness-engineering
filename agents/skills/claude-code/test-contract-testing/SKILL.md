# Test Contract Testing

> Verify service compatibility using Pact consumer-provider contract tests

## When to Use

- Verifying that two services (consumer and provider) agree on API format
- Preventing breaking changes when services are deployed independently
- Testing service integration without running all services together
- Replacing fragile end-to-end tests across service boundaries

## Instructions

1. **Install Pact:**

```bash
npm install -D @pact-foundation/pact
```

2. **Write a consumer test** — define what the consumer expects from the provider:

```typescript
import { PactV4 } from '@pact-foundation/pact';

const provider = new PactV4({
  consumer: 'OrderService',
  provider: 'UserService',
});

describe('UserService API', () => {
  it('returns user by ID', async () => {
    await provider
      .addInteraction()
      .given('a user exists with ID 123')
      .uponReceiving('a request for user 123')
      .withRequest('GET', '/api/users/123', (builder) => {
        builder.headers({ Accept: 'application/json' });
      })
      .willRespondWith(200, (builder) => {
        builder.headers({ 'Content-Type': 'application/json' }).jsonBody({
          id: '123',
          name: 'Alice',
          email: 'alice@example.com',
        });
      })
      .executeTest(async (mockServer) => {
        const client = new UserClient(mockServer.url);
        const user = await client.getUser('123');

        expect(user).toEqual({
          id: '123',
          name: 'Alice',
          email: 'alice@example.com',
        });
      });
  });
});
```

3. **Generate the pact file** — running the consumer test creates a contract file (e.g., `pacts/OrderService-UserService.json`).

4. **Verify on the provider side:**

```typescript
import { Verifier } from '@pact-foundation/pact';

describe('Pact Verification', () => {
  it('validates the OrderService contract', async () => {
    const verifier = new Verifier({
      providerBaseUrl: 'http://localhost:3001',
      pactUrls: ['./pacts/OrderService-UserService.json'],
      stateHandlers: {
        'a user exists with ID 123': async () => {
          await seedUser({ id: '123', name: 'Alice', email: 'alice@example.com' });
        },
      },
    });

    await verifier.verifyProvider();
  });
});
```

5. **Use a Pact Broker** for sharing contracts across repos:

```typescript
// Consumer publishes
await publishPacts({
  pactFilesOrDirs: ['./pacts'],
  pactBroker: 'https://your-broker.pactflow.io',
  consumerVersion: process.env.GIT_SHA,
  tags: ['main'],
});

// Provider verifies from broker
const verifier = new Verifier({
  providerBaseUrl: 'http://localhost:3001',
  pactBrokerUrl: 'https://your-broker.pactflow.io',
  providerVersionTags: ['main'],
  publishVerificationResult: true,
});
```

6. **State handlers** set up test data for each interaction:

```typescript
stateHandlers: {
  'no users exist': async () => {
    await db.user.deleteMany();
  },
  'a user exists with ID 123': async () => {
    await db.user.upsert({
      where: { id: '123' },
      create: { id: '123', name: 'Alice', email: 'alice@example.com' },
      update: {},
    });
  },
},
```

7. **Use matchers** for flexible contract validation:

```typescript
import { like, eachLike, regex } from '@pact-foundation/pact';

.jsonBody({
  id: like('123'),                    // any string
  name: like('Alice'),                // any string
  email: regex(/.*@.*/, 'a@b.com'),   // matches regex
  posts: eachLike({ title: like('Post') }), // array of objects
})
```

## Details

Contract testing verifies that two services agree on the format of their communication. The consumer defines its expectations as a "contract," and the provider verifies it can fulfill that contract.

**Consumer-driven contracts:** The consumer writes the contract because it knows what it needs. The provider verifies it can deliver. This ensures the provider does not make breaking changes that affect consumers.

**Contract vs integration vs E2E:**

- **Contract** — verifies the API shape (request/response format) without running both services
- **Integration** — tests actual communication between running services
- **E2E** — tests the full user journey across all services

Contract tests are faster and more focused than integration tests but do not verify business logic.

**Pact workflow:**

1. Consumer writes tests → generates pact file (contract)
2. Pact file is shared (Pact Broker or file system)
3. Provider runs verification tests against the pact file
4. If verification fails, the provider has a breaking change

**Trade-offs:**

- Contract tests catch breaking API changes early — but do not test business logic
- Consumer-driven contracts align with consumer needs — but require provider teams to run verification
- Pact Broker enables cross-repo sharing — but adds infrastructure to maintain
- Matchers provide flexibility — but overly flexible matchers can miss real breaking changes

## Source

https://docs.pact.io/
