---
module: orchestrator
tags: [lease, ttl, cleanup]
problem_type: race-condition
last_updated: '2026-05-05'
track: bug-track
category: integration-issues
---

# Stalled lease cleanup in orchestrator

## Problem

Long-lived orchestrator leases were not being released when the holding worker crashed without cleanup, leaving issues stuck in `in-progress` state forever.

## Root cause

No TTL on lease records and no sweep at startup. A SIGKILL of the worker left the lease row intact.

## Solution

- Added 5-minute TTL to lease records.
- Added a sweep step at orchestrator startup that releases leases older than the TTL.

## Prevention

- Pre-flight: any new long-running coordination primitive must include a TTL plus a startup sweep.
- Test: kill -9 a worker mid-lease; expect cleanup within TTL.
