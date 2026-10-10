---
'@harness-engineering/cli': patch
---

Name the stale-server cause instead of a deleted build chunk

When the CLI is upgraded underneath a running MCP server, the next lazily
imported tool resolves against a content-hashed chunk the upgrade deleted, and
Node's `ERR_MODULE_NOT_FOUND` names two build artefacts that appear in no source
file. Every piece of evidence points at a corrupt install, which is the one
thing it is not — so the server now recognises that one failure shape and
answers with the cause, the remedy (restart the server, do not reinstall), and
the version actually on disk. Anything else rethrows untouched.

Patch rather than minor: this adds no API and changes no contract. It replaces
one error message with a better one on a path that previously only ever threw,
so nothing a consumer could have depended on behaves differently.
