---
'@harness-engineering/cli': patch
---

Comprehension semantic generation is now provider-aware and no longer forces a
Claude model id onto non-Claude providers. The cheap Claude default
(`claude-haiku-4-5`) applies only to Claude-family providers (Anthropic key /
`claude`-CLI); a local OpenAI-compatible endpoint uses its own configured model
(`HARNESS_ANALYSIS_MODEL`) instead of having a Claude id imposed on it (which
previously overrode `HARNESS_ANALYSIS_MODEL` and degraded those runs to
static-only). An explicit `comprehension.model` still wins for any provider. Adds
`resolveProviderKind` (single source of the provider precedence) and
`defaultSemanticModel(kind)`; the only hardcoded model id is now contained to the
one path where it is correct, reducing the drift surface.
