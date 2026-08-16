---
'@harness-engineering/cli': patch
---

fix(craft): nesting-aware fenced-JSON parse stops dropping findings

Every craft family's CRITIQUE phase used a lazy fence regex
(`/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/`) to extract the JSON finding from the
LLM response. When a finding's `message` value itself contained a ```fence
(critiques routinely quote code blocks), the lazy match truncated at that inner
fence,`JSON.parse` threw, and the finding was silently dropped.

Extraction is now nesting-aware via a single shared util,
`extractFencedJsonPayload` (`shared/craft/fenced-json.ts`): it anchors on the
opening fence, then runs a string/escape-aware, brace-balanced scan that returns
the first complete JSON value. Inner fences inside string values no longer
truncate the object, and two separate fenced blocks are never merged. All ten
craft families (code / docs / spec / copy / naming / test / security / api /
cli-ergonomics / knowledge) now share this util; the duplicated regexes,
`FENCED_JSON` consts, and `stripJsonFence` helper are gone.
