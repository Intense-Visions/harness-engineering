---
schemaVersion: 1
module: "templates/axum/src"
sourceHash: "6083cd44919110a551cac4ea2b6807d18ad1e9b90204eae2afea782d1ae94a6a"
compiledAt: "2026-08-28T01:22:12.804Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["main.rs"]
---

## Summary

This is a minimal Axum web server template that demonstrates the canonical setup for a Tokio-based async HTTP service. It defines a single GET endpoint at "/" that returns the string "Hello, world!", binds to localhost:3000, and serves requests indefinitely. The template uses Axum's routing DSL and Tokio's async executor, making it suitable as a scaffold for expanding into a larger service.

## Invariants

- Tokio async runtime required: Code depends on #[tokio::main] and tokio::net::TcpListener — must be running under Tokio or equivalent async executor.
- Route handler matches HTTP semantics: The root handler is wired to GET "/" — changing the route or HTTP method requires updating both the handler signature and .route() call in sync.
- Listener bind will panic on port conflict: Uses .await.unwrap() on bind, so port 3000 must be available or the process exits hard.
- Response type is IntoResponse: The &'static str return type implicitly requires it to be convertible to an Axum response — changing the return type must preserve this contract or the router will not compile.
- No error handling in handler: The handler is infallible — if it ever needs to return errors, the signature and router type must change together.

## Interface Contract

```ts

```

## Dependency Slice

```

```
