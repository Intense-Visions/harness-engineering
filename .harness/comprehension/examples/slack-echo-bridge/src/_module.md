---
schemaVersion: 1
module: 'examples/slack-echo-bridge/src'
sourceHash: '869a0cb66dc4c223e3fd29eff5fa463152bce38f5c2636d69ab23b79034d2c1e'
compiledAt: '2026-08-28T01:22:08.623Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'logger.ts', 'signer.ts', 'slack-client.ts', 'types.ts', 'webhook-handler.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { log } from './logger.js'
import { verify } from './signer.js'
import { SlackPoster, createSlackPoster } from './slack-client.js'
import { GatewayEvent, MaintenanceCompletedData } from './types.js'
import { createWebhookServer, installShutdownHandlers } from './webhook-handler.js'
import { WebClient } from '@slack/web-api'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { IncomingMessage, Server, ServerResponse, createNodeServer } from 'node:http'
```
