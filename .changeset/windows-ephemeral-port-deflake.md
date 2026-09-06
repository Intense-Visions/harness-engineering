---
'@harness-engineering/orchestrator': patch
---

Fix `server.port: 0` being treated as "disabled" and deflake the Windows CI ephemeral-port bind

`ServerConfig.port` is typed `number | null` and documents `null` as the disable sentinel, but the
orchestrator gated server construction on a truthiness test. A configured port of `0` is falsy, so
it silently skipped server construction instead of binding an OS-assigned ephemeral port — even
though `OrchestratorServer` implements and documents port-0 support via its `boundPort` getter.
The gate now compares against `null`, so `undefined`/`null` still disable the server while `0`
correctly requests an ephemeral port.

This also removes a Windows CI flake: two integration tests guessed a random port in the
30000-49999 range, which overlaps the ephemeral-port ranges Hyper-V/WSL reserve on Windows. A bind
into a reserved range is refused with `EACCES` (not `EADDRINUSE`), failing the job on an unhandled
rejection despite every test passing. Both sites now bind `0` and let the OS assign a free port.
