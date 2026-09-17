---
'@harness-engineering/core': patch
---

Remote comprehension batch listing now returns the Outpost's units. `listUnitPaths` sent `modules: []`, which the hosted serve route reads as a request for zero modules, so remote enumeration always came back empty. The request now omits `modules`, which the route reads as "every unit for the Outpost".
