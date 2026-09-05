---
'@harness-engineering/cli': patch
---

Raise the Docker smoke-test image-size budget from 800MB to 1000MB.

The first release-path execution of the `docker / smoke-test` job measured the orchestrator image at
815MB against an 800MB limit. The limit was set to 800 in `aeb815856` when the largest image was
774MB — only 3.4% of headroom — so ordinary dependency growth turned the tripwire into a scheduled
failure. 1000MB restores ~23% headroom while still catching the structural regressions this check
exists for (devDependencies or the build stage leaking into a runtime image), each of which costs
many hundreds of MB.
