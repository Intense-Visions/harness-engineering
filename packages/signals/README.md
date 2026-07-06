# @harness-engineering/signals

Curated repo-health signals for Harness Engineering, packaged as a shared leaf module.

This package gathers a small, curated set of repository-health signals (coverage trend,
complexity trend, PR review latency, eval fail-rate, baseline updates) into self-contained
result cards. It exports `gatherSignals` (run every registered provider against a freshly
built context) and `signalRegistry` (the ordered provider list), along with the supporting
signal types. It depends only on `@harness-engineering/graph` and `zod`, so consumers such
as the CLI can use it without pulling in the dashboard application.
