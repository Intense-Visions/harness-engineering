# How to add an end-to-end (E2E) test

The harness has strong UNIT coverage but unit tests mock the boundaries —
`spawn`, network, MCP, git, real file IO — so an entire class of failure is
invisible: the behavior of the REAL external tool. The motivating bug (#1558) is
exact — the `claude` CLI sometimes narrates ("I've already called the
StructuredOutput tool…") and omits `structured_output`; every unit test mocked
`spawn`, so only a live run surfaced it. The E2E framework makes real-boundary
coverage the default.

The decision of record is **ADR 0111** (`docs/knowledge/decisions/0111-project-wide-e2e-testing-framework.md`).
It is a tiered framework on the **existing vitest + turbo stack** — no new runner,
no new package. Playwright stays scoped to browser/dashboard flows only.

## The three tiers

| Tier                              | What it exercises                                                                                                                                                                                            | Cadence                     | Determinism               |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------- | ------------------------- |
| **A — real-boundary integration** | Real subprocess / git / file / MCP IO against hermetic fixtures + real temp git repos. The boundary under test is NEVER mocked; real tool behavior is replayed from captured artifacts. No live network/LLM. | Every PR                    | Deterministic             |
| **B — gated live smoke**          | Real `claude` CLI, real dispatch, real MCP round-trips, real provider path.                                                                                                                                  | Nightly (`main-health.yml`) | Non-deterministic, opt-in |
| **C — CLI smoke**                 | `harness <cmd>` as a real subprocess against a scaffolded temp project; on-disk output + exit codes.                                                                                                         | Every PR                    | Deterministic             |

Tier A/C run inside the ordinary `turbo run test:coverage` on the
`[ubuntu, windows, macos]` matrix; Tier B is a no-op unless `HARNESS_E2E_LIVE=1`.

## Conventions

- **Naming:** the `*.e2e.test.ts` suffix is the tier marker.
- **Location:** beside the package under test — `packages/<pkg>/tests/e2e/**` —
  discovered by the existing per-package vitest config. No separate runner.
- **Fixtures:** captured real-tool outputs live at the repo root
  `fixtures/<tool>/` (e.g. `fixtures/claude-cli/`), documented in a README there.
- **Gates:** use the shared `describe.skipIf(...)` predicates (below), never a
  hand-rolled env var.

## The shared helpers

Import everything from the support module (today at
`packages/cli/tests/e2e/support`):

| Export                                                                                       | Purpose                                                                                                                                                                  |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `runHarness(args, { cwd, env? })`                                                            | Spawn the REAL built `harness` binary (win32-safe: `process.execPath` + the `.js` entry, never the `.bin` shim). Returns `{ status, stdout, stderr }`.                   |
| `HAS_HARNESS_BIN`                                                                            | Whether `dist/bin/harness.js` exists (build before running).                                                                                                             |
| `scaffoldProject(files)` / `initGitRepo(dir)` / `cleanup(dir)`                               | Real temp project + real git repo, then teardown.                                                                                                                        |
| `loadClaudeEnvelope(name)`                                                                   | Load a captured `claude`-CLI envelope from `fixtures/claude-cli/`.                                                                                                       |
| `withFakeClaude(envelope, opts?)` / `removeFakeClaude(dir)` / `fakeProviderEnv(dir, extra?)` | Drop a fake `claude` on PATH emitting a captured envelope (with an optional `chattyOnce` mode that replays the #1558 miss), and an env that steers the resolver onto it. |
| `skipUnlessBin` / `skipUnlessBinPosix` / `skipTierB`                                         | The tier `skipIf` predicates.                                                                                                                                            |

## Tier C — the minimal template

See `packages/cli/tests/e2e/cli-smoke.e2e.test.ts`:

```ts
import { runHarness, scaffoldProject, initGitRepo, cleanup, skipUnlessBin } from './support';

describe.skipIf(skipUnlessBin)('harness <cmd> — Tier C smoke', () => {
  let proj: string;
  beforeAll(() => {
    proj = scaffoldProject({ 'src/x.ts': '…' });
    initGitRepo(proj);
  });
  afterAll(() => cleanup(proj));

  it('runs and exits 0', () => {
    const r = runHarness(['<cmd>', '--flag'], { cwd: proj });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/expected on-disk-or-stdout signal/);
  });
});
```

## Tier A — replaying real tool behavior

See `packages/cli/tests/e2e/comprehend-boundary.e2e.test.ts`. The boundary (the
`claude` spawn) is a REAL subprocess; only the tool's _output_ is a captured
fixture. To reproduce a real-tool bug, capture its envelope into
`fixtures/claude-cli/` (see that dir's README) and replay it:

```ts
const fakeDir = withFakeClaude(loadClaudeEnvelope('structured-output'), {
  chattyOnce: { chattyEnvelope: loadClaudeEnvelope('chatty-narration'), counterFile },
});
const env = fakeProviderEnv(fakeDir, { HARNESS_COMPREHENSION_MAIN_PASS: '1' });
const r = runHarness(['comprehend', '--all'], { cwd: proj, env });
```

Tier A that drops an executable on PATH is POSIX-only (`skipUnlessBinPosix`); a
static Tier C path covers win32.

## Tier B — gated live

Guard with `describe.skipIf(skipTierB)`. It runs only under `HARNESS_E2E_LIVE=1`,
which the nightly lane sets. Keep Tier B assertions **degradation-safe** — assert
the invariant that holds whether or not the live tool resolves — so an unavailable
provider is a clean skip/pass, never a flaky red. Captured fixtures can drift from
real tool behavior; Tier B is the backstop that detects that drift, so a
silently-skipped Tier B re-opens the #1558 gap. The nightly lane therefore asserts
the gate's own reachability, not just the tests behind it.

## Running

```bash
pnpm test:e2e        # Tier A/C (per-PR subset)
pnpm test:e2e:live   # Tier B (HARNESS_E2E_LIVE=1)
```

## Candidate flows (adopt Tier A/C by default)

Per #1691: comprehension compile→serve hash-equality; orchestrator
dispatch→gate→completion; MCP tool registration + representative round-trips; the
analysis-provider live path (Tier B).
