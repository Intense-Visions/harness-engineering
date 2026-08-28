---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/sidebar'
sourceHash: '89cb4021d54c48ed464972f04e2a62c3f3cbd76ef97c33ee1bef0683dc8261ec'
compiledAt: '2026-08-28T01:22:11.276Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['SidebarSection.tsx', 'SystemNavItem.tsx', 'ThreadListItem.tsx']
---

## Interface Contract

```ts
export SidebarSection
export SystemNavItem
export ThreadListItem
```

## Dependency Slice

```
import { useThreadStore } from '../../stores/threadStore'
import { Thread } from '../../types/thread'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, AlertTriangle, BarChart3, Bot, Brain, ChevronDown, Database, GitPullRequest, KanbanSquare, Key, Link2, Map, MessageSquare, Radio, Route, Settings, Share2, Signal, TrendingDown, Webhook, Wrench, X, Zap } from 'lucide-react'
import { ReactNode, useState } from 'react'
import { NavLink, useNavigate } from 'react-router'
```
