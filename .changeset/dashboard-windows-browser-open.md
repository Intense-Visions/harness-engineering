---
'@harness-engineering/cli': patch
---

Fix `harness dashboard` dying on Windows, and make `--no-open` actually work.

Two defects compounded so that the dashboard could never start on Windows. The API
server came up correctly and was then killed by the browser-launch step:

```
Dashboard API starting on http://localhost:3701
Error: spawn start ENOENT
    syscall: 'spawn start', path: 'start', spawnargs: [ 'http://localhost:3701' ]
```

`--no-open` was inert (#1956): Commander stores a `--no-x` flag under its positive
key, so `opts.open` is `false` when the flag is passed and `noOpen` is never created.
`runDashboard` read `opts.noOpen !== true`, which is always true. `DashboardOptions`
is renamed to `open` rather than only flipping the comparison, following the
`test-craft.ts` idiom from #1954 — declaring the field the other way round is what let
the unreachable read typecheck.

And `start` is a cmd.exe builtin, not an executable, so `spawn('start', …)` without
`shell` can only raise ENOENT. With no `'error'` listener that became an unhandled
`'error'` event, which is fatal. `openBrowser` now spawns through a shell on win32 and
attaches a handler, so a failed browser launch can never take down the server.

macOS and Linux never saw this: `open` and `xdg-open` are real executables, so the
browser nobody asked for opened silently and nothing crashed.
