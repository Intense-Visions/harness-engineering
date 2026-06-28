---
'@harness-engineering/orchestrator': patch
---

Add a real `LinearGraphQLClient`, replacing the `LinearGraphQLStub` that only `console.log`ged the query and returned an empty object. The client POSTs the operation to Linear's GraphQL endpoint (`https://api.linear.app/graphql`, overridable) with the API key in the `Authorization` header, and normalizes all three failure modes — transport throw, non-2xx HTTP (with a truncated body), and a GraphQL `errors` array — into a single `Err`, returning `Ok(data)` on success. `fetch` is injectable for testing. `LinearGraphQLStub` is retained but `@deprecated`.

Scope note: this is the authenticated GraphQL transport. Wiring a full `linear` tracker _kind_ (mapping Linear issues to `TrackedFeature` and implementing the tracker-client interface) is a larger follow-up that builds on this client.
