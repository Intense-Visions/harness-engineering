---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/sidebar'
sourceHash: '89cb4021d54c48ed464972f04e2a62c3f3cbd76ef97c33ee1bef0683dc8261ec'
compiledAt: '2026-08-28T01:22:11.276Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['SidebarSection.tsx', 'SystemNavItem.tsx', 'ThreadListItem.tsx']
---

## Summary

The sidebar module exports three composable navigation/list components for a dashboard UI:

**SidebarSection** is a collapsible accordion-style container with a labeled header, optional count badge, and smooth open/close animation. The chevron icon rotates 90° and the content animates in/out via height and opacity.

**SystemNavItem** is a system page navigation link (18 hardcoded page→icon mappings) with React Router integration. It shows active state styling via NavLink's `isActive` prop and falls back to a generic Activity icon for unmapped pages.

**ThreadListItem** is an interactive thread card that renders an avatar, title, and status indicator. It tracks active state via a Zustand store, integrates with React Router navigation, and shows a dismissible close button (except for "attention"-type threads). Avatars vary by thread type (organism/alert/user/default); status dots only appear for pending/active states.

All three use Framer Motion for animations and Lucide icons. The module is dependency-light: it imports from a thread store, thread type, and React Router, with no internal cross-dependencies between the three components.

## Invariants

- Count display: SidebarSection only renders the count badge when count !== undefined && count > 0
- StatusDot rendering: Only returns a DOM node for pending or active statuses; returns null otherwise
- Close button visibility: ThreadListItem hides the close button for type === 'attention' threads
- PAGE_ICONS fallback: SystemNavItem falls back to Activity icon for unmapped pages; missing this fallback crashes
- Active state source of truth: ThreadListItem's active styling depends on useThreadStore.getState().activeThreadId matching thread.id
- AnimatePresence initial={false}: SidebarSection prevents unwanted animations on first mount
- Avatar switch default case: ThreadAvatar's default case handles unknown avatar types gracefully
- Thread title truncation: ThreadListItem uses truncate class for overflow handling; removing it breaks layout on long titles

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
