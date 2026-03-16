# Hello World — Harness Engineering (Basic)

A minimal project showing what harness engineering looks like at the **basic** adoption level.

## What is this?

A tiny greeting library managed by harness. It demonstrates the foundation: configuration, validation, and agent context — the building blocks every harness project uses.

## Try it

```bash
cd examples/hello-world
npm install
harness validate
```

You should see validation pass. This confirms:

- `harness.config.json` is valid
- `AGENTS.md` exists and is readable
- Layer definitions are syntactically correct

## What just happened?

`harness validate` checked your project's configuration and structure. At the basic level, this means:

- The config file parses correctly and has required fields
- The AGENTS.md knowledge map exists where the config says it should
- Layer definitions (if any) are well-formed

No linting rules are enforced at the basic level — that comes in the [task-api example](../task-api/).

## Explore the config

Open `harness.config.json`:

```json
{
  "version": 1,
  "name": "harness-hello-world",
  "layers": [...],
  "agentsMapPath": "./AGENTS.md",
  "docsDir": "./docs",
  "template": { "level": "basic", "version": 1 }
}
```

- **layers** — Defines the architectural layers. Even at basic level, you declare them. They're enforced starting at intermediate level.
- **agentsMapPath** — Where AI agents look for project context.
- **template.level** — Which harness adoption level this project uses.

## What does sample state look like?

Check `.harness.example/` to see what a project's state directory looks like after a few sessions:

- `state.json` — Current position, progress, decisions
- `learnings.md` — Institutional knowledge captured over time

In a real project, this would be `.harness/` (not `.harness.example/`).

## Next

Ready for layer enforcement, ESLint rules, and personas? Try the [task-api example](../task-api/).
