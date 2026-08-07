---
'@harness-engineering/cli': patch
---

Fix the hook installer so installed hooks load cleanly in adopter projects.

- Write `.harness/hooks/package.json` (`{ "type": "module" }`) at install time (both `harness hooks init` and `harness hooks add`). The hook scripts are ES modules shipped as bare `.js`; without this marker Node resolves their module type from the adopter's nearest `package.json` — which is CommonJS-default (or absent) in most projects — and reparses each hook as ESM at runtime, emitting a `MODULE_TYPELESS_PACKAGE_JSON` warning on every hook fire.
- Ship `read-hook-stdin.js` alongside the hooks that import it. Those hooks were installed without their shared sibling module and failed at load with `ERR_MODULE_NOT_FOUND` — a non-blocking failure that silently stopped the gate from running. A new registry↔import drift guard fails the build if a hook imports a sibling module the installer does not ship, so this cannot silently regress.
