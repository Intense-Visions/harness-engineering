---
'@harness-engineering/cli': minor
---

feat(mcp): let the eval judgment tools run fully-locally

`acceptance_eval` and `outcome_eval` construct an LLM `AnalysisProvider` to judge
a spec's acceptance criteria / an outcome — but both hardcoded
`AnthropicAnalysisProvider` and returned `null` without `ANTHROPIC_API_KEY`, so in
a fully-local run (no cloud key) the judgment silently degraded to an advisory
stub and the tools were effectively inert. That left a local pipeline's weak
coder with no strong judge for the reconciliation it can't do on its own.

Both resolvers (previously byte-identical) are unified into a shared
`resolveAnalysisProvider` that adds a local fallback: when no `ANTHROPIC_API_KEY`
is set but `HARNESS_ANALYSIS_BASE_URL` is, it constructs an
`OpenAICompatibleAnalysisProvider` against that `/v1` endpoint
(`HARNESS_ANALYSIS_MODEL` names the judge; `HARNESS_ANALYSIS_API_KEY` defaults to
`ollama`) — so the reasoner can serve verdicts on-device. Anthropic still wins
when a key is present (backward compatible); absent both signals, behaviour is
byte-identical to before (null → advisory).

This is the foundation for wiring the harness's own verifier/reviewer judgment
into the local orchestrator's stages; a follow-up threads the reasoner endpoint
into the injected MCP server and updates the local stage prompt to call these
tools.
