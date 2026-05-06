---
module: <package-or-area>
tags: [<tag1>, <tag2>]
problem_type: <short-noun-phrase>
last_updated: 'YYYY-MM-DD'
track: <bug-track | knowledge-track>
category: <category-from-schema.yaml>
---

# <Title — concise problem statement>

<!-- Bug-track sections: Problem, Root cause, Solution, Prevention. -->
<!-- Knowledge-track sections: Context, Guidance, Applicability. -->

## Problem

<!-- bug-track: What was failing and how it manifested. -->
<!-- knowledge-track: omit this section. -->

## Root cause

<!-- bug-track: The underlying cause. Cite file:line where helpful. -->
<!-- knowledge-track: omit this section. -->

## Solution

<!-- bug-track: The fix; reference the commit(s). -->
<!-- knowledge-track: omit this section. -->

## Prevention

<!-- bug-track: What stops this class of problem from recurring (test, lint rule, ADR). -->
<!-- knowledge-track: omit this section. -->

## Context

<!-- knowledge-track: Where and when this pattern applies. -->
<!-- bug-track: omit this section. -->

## Guidance

<!-- knowledge-track: The pattern itself, with concrete examples. -->
<!-- bug-track: omit this section. -->

## Applicability

<!-- knowledge-track: When NOT to use it; trade-offs. -->
<!-- bug-track: omit this section. -->

## References

- <link to commit, PR, or external resource>
