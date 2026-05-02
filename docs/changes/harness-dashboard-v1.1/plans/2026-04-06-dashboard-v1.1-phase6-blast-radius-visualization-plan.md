# Plan: Dashboard v1.1 Phase 6 -- Blast Radius Visualization

**Date:** 2026-04-06
**Spec:** docs/changes/harness-dashboard-v1.1/proposal.md
**Estimated tasks:** 5
**Estimated time:** ~25 minutes

## Goal

Replace the raw JSON blast radius display in Impact.tsx with a layered SVG visualization component (BlastRadiusGraph.tsx) that shows depth columns, probability-based node opacity, risk-colored nodes, parent-child edges, depth labels, and a summary bar.

## Observable Truths (Acceptance Criteria)

1. When BlastRadiusData is loaded in the Impact page, the system shall render an SVG element containing the source node on the left and depth columns expanding rightward.
2. Each BlastRadiusNode shall be rendered as a rectangle with opacity proportional to its `probability` value (clamped to a minimum of 0.15 for visibility).
3. Nodes with probability > 0.7 shall have a red (#ef4444) stroke, nodes with probability 0.3--0.7 shall have an amber (#f59e0b) stroke, and nodes with probability < 0.3 shall have a blue-gray (#6b7280) stroke.
4. When a node has a `parentId` matching another node's `nodeId`, the system shall draw an SVG line from the parent node to the child node.
5. Each depth column shall display a "Depth N" label at the top.
6. The summary bar showing total affected, high/medium/low risk counts with color-coded badges, and max depth shall be rendered above the SVG graph.
7. If BlastRadiusData has zero layers, the system shall display a "No affected nodes" message instead of an empty SVG.
8. The `<pre>` JSON dump currently at Impact.tsx:265-272 shall be replaced with the `<BlastRadiusGraph>` component.
9. `npx vitest run tests/client/components/BlastRadiusGraph.test.ts` passes with all tests green.
10. `harness validate` passes.

## File Map

```
CREATE packages/dashboard/src/client/components/BlastRadiusGraph.tsx
CREATE packages/dashboard/tests/client/components/BlastRadiusGraph.test.ts
MODIFY packages/dashboard/src/client/pages/Impact.tsx (replace JSON dump with BlastRadiusGraph)
```

_Skeleton not produced -- task count (5) below threshold (8)._

## Tasks

### Task 1: Create BlastRadiusGraph layout utility and risk color constants

**Depends on:** none
**Files:** `packages/dashboard/src/client/components/BlastRadiusGraph.tsx`

1. Create `packages/dashboard/src/client/components/BlastRadiusGraph.tsx` with layout constants, risk classification function, and the layout computation function (no JSX yet -- pure logic):

   ```typescript
   import type { BlastRadiusData, BlastRadiusNode } from '@shared/types';

   // --- Layout constants ---
   const NODE_W = 130;
   const NODE_H = 30;
   const COL_GAP = 180;
   const ROW_GAP = 44;
   const PADDING = { top: 40, right: 24, bottom: 24, left: 24 };
   const SOURCE_COL_X = PADDING.left;

   // --- Risk classification ---
   export const RISK_COLORS = {
     high: '#ef4444',
     medium: '#f59e0b',
     low: '#6b7280',
   } as const;

   export type RiskLevel = keyof typeof RISK_COLORS;

   export function classifyRisk(probability: number): RiskLevel {
     if (probability > 0.7) return 'high';
     if (probability >= 0.3) return 'medium';
     return 'low';
   }

   export function clampOpacity(probability: number): number {
     return Math.max(0.15, Math.min(1, probability));
   }

   // --- Layout computation ---
   export interface LayoutNode {
     nodeId: string;
     name: string;
     type: string;
     probability: number;
     parentId: string;
     risk: RiskLevel;
     x: number;
     y: number;
   }

   export interface LayoutEdge {
     fromId: string;
     toId: string;
   }

   export interface GraphLayout {
     nodes: LayoutNode[];
     sourceNode: LayoutNode;
     edges: LayoutEdge[];
     width: number;
     height: number;
   }

   export function computeBlastRadiusLayout(data: BlastRadiusData): GraphLayout | null {
     if (data.layers.length === 0) return null;

     const allNodes: LayoutNode[] = [];
     const edges: LayoutEdge[] = [];

     // Source node at column 0
     const sourceNode: LayoutNode = {
       nodeId: data.sourceNodeId,
       name: data.sourceName,
       type: 'source',
       probability: 1.0,
       parentId: '',
       risk: 'high',
       x: SOURCE_COL_X,
       y: PADDING.top,
     };
     allNodes.push(sourceNode);

     // Position layer nodes in columns
     for (const layer of data.layers) {
       const colX = SOURCE_COL_X + layer.depth * COL_GAP;
       layer.nodes.forEach((node: BlastRadiusNode, rowIdx: number) => {
         const layoutNode: LayoutNode = {
           nodeId: node.nodeId,
           name: node.name,
           type: node.type,
           probability: node.probability,
           parentId: node.parentId,
           risk: classifyRisk(node.probability),
           x: colX,
           y: PADDING.top + rowIdx * ROW_GAP,
         };
         allNodes.push(layoutNode);
         edges.push({ fromId: node.parentId, toId: node.nodeId });
       });
     }

     // Compute SVG dimensions
     const maxX = Math.max(...allNodes.map((n) => n.x + NODE_W)) + PADDING.right;
     const maxY = Math.max(...allNodes.map((n) => n.y + NODE_H)) + PADDING.bottom;

     return { nodes: allNodes, sourceNode, edges, width: maxX, height: maxY };
   }
   ```

2. This is a partial file -- the JSX component will be added in Task 3. The file is valid TypeScript (exports only functions and types).
3. Run: `npx tsc --noEmit -p packages/dashboard/tsconfig.json 2>&1 | head -20` -- verify no type errors in the new file.
4. Run: `harness validate`
5. Commit: `feat(dashboard): add blast radius layout computation and risk utilities`

### Task 2: Write tests for BlastRadiusGraph

**Depends on:** Task 1
**Files:** `packages/dashboard/tests/client/components/BlastRadiusGraph.test.ts`

1. Create `packages/dashboard/tests/client/components/BlastRadiusGraph.test.ts`:

   ```typescript
   import { describe, it, expect } from 'vitest';
   import {
     classifyRisk,
     clampOpacity,
     computeBlastRadiusLayout,
     RISK_COLORS,
   } from '../../../src/client/components/BlastRadiusGraph';
   import type { BlastRadiusData } from '../../../src/shared/types';

   // --- Test fixtures ---
   function makeTestData(overrides?: Partial<BlastRadiusData>): BlastRadiusData {
     return {
       sourceNodeId: 'src-1',
       sourceName: 'core/utils.ts',
       layers: [
         {
           depth: 1,
           nodes: [
             { nodeId: 'a', name: 'moduleA', type: 'file', probability: 0.9, parentId: 'src-1' },
             { nodeId: 'b', name: 'moduleB', type: 'file', probability: 0.5, parentId: 'src-1' },
           ],
         },
         {
           depth: 2,
           nodes: [{ nodeId: 'c', name: 'moduleC', type: 'file', probability: 0.2, parentId: 'a' }],
         },
       ],
       summary: {
         totalAffected: 3,
         maxDepth: 2,
         highRisk: 1,
         mediumRisk: 1,
         lowRisk: 1,
       },
       ...overrides,
     };
   }

   describe('classifyRisk', () => {
     it('returns high for probability > 0.7', () => {
       expect(classifyRisk(0.71)).toBe('high');
       expect(classifyRisk(1.0)).toBe('high');
     });

     it('returns medium for probability 0.3-0.7', () => {
       expect(classifyRisk(0.3)).toBe('medium');
       expect(classifyRisk(0.5)).toBe('medium');
       expect(classifyRisk(0.7)).toBe('medium');
     });

     it('returns low for probability < 0.3', () => {
       expect(classifyRisk(0.29)).toBe('low');
       expect(classifyRisk(0.0)).toBe('low');
     });
   });

   describe('clampOpacity', () => {
     it('clamps low values to 0.15 minimum', () => {
       expect(clampOpacity(0.0)).toBe(0.15);
       expect(clampOpacity(0.1)).toBe(0.15);
     });

     it('passes through values in range', () => {
       expect(clampOpacity(0.5)).toBe(0.5);
       expect(clampOpacity(1.0)).toBe(1.0);
     });

     it('clamps values above 1.0', () => {
       expect(clampOpacity(1.5)).toBe(1);
     });
   });

   describe('computeBlastRadiusLayout', () => {
     it('returns null for empty layers', () => {
       const data = makeTestData({ layers: [] });
       expect(computeBlastRadiusLayout(data)).toBeNull();
     });

     it('creates source node plus all layer nodes', () => {
       const data = makeTestData();
       const layout = computeBlastRadiusLayout(data)!;
       // 1 source + 2 depth-1 + 1 depth-2 = 4
       expect(layout.nodes).toHaveLength(4);
     });

     it('source node is at column 0', () => {
       const data = makeTestData();
       const layout = computeBlastRadiusLayout(data)!;
       expect(layout.sourceNode.x).toBe(layout.nodes[0]!.x);
       expect(layout.sourceNode.nodeId).toBe('src-1');
     });

     it('depth-1 nodes are in column 1 (offset by COL_GAP)', () => {
       const data = makeTestData();
       const layout = computeBlastRadiusLayout(data)!;
       const depth1Nodes = layout.nodes.filter((n) => n.nodeId === 'a' || n.nodeId === 'b');
       expect(depth1Nodes).toHaveLength(2);
       // All depth-1 nodes share the same x
       const x = depth1Nodes[0]!.x;
       expect(depth1Nodes[1]!.x).toBe(x);
       // Must be greater than source x
       expect(x).toBeGreaterThan(layout.sourceNode.x);
     });

     it('creates edges from parentId to nodeId', () => {
       const data = makeTestData();
       const layout = computeBlastRadiusLayout(data)!;
       expect(layout.edges).toHaveLength(3); // a->src-1, b->src-1, c->a
       expect(layout.edges).toContainEqual({ fromId: 'src-1', toId: 'a' });
       expect(layout.edges).toContainEqual({ fromId: 'src-1', toId: 'b' });
       expect(layout.edges).toContainEqual({ fromId: 'a', toId: 'c' });
     });

     it('assigns risk levels based on probability', () => {
       const data = makeTestData();
       const layout = computeBlastRadiusLayout(data)!;
       const nodeA = layout.nodes.find((n) => n.nodeId === 'a')!;
       const nodeB = layout.nodes.find((n) => n.nodeId === 'b')!;
       const nodeC = layout.nodes.find((n) => n.nodeId === 'c')!;
       expect(nodeA.risk).toBe('high'); // 0.9
       expect(nodeB.risk).toBe('medium'); // 0.5
       expect(nodeC.risk).toBe('low'); // 0.2
     });

     it('computes positive width and height', () => {
       const data = makeTestData();
       const layout = computeBlastRadiusLayout(data)!;
       expect(layout.width).toBeGreaterThan(0);
       expect(layout.height).toBeGreaterThan(0);
     });
   });

   describe('RISK_COLORS', () => {
     it('has all three risk levels', () => {
       expect(RISK_COLORS.high).toBe('#ef4444');
       expect(RISK_COLORS.medium).toBe('#f59e0b');
       expect(RISK_COLORS.low).toBe('#6b7280');
     });
   });
   ```

2. Run: `npx vitest run tests/client/components/BlastRadiusGraph.test.ts`
3. Observe: all tests pass (the layout logic from Task 1 is already implemented).
4. Run: `harness validate`
5. Commit: `test(dashboard): add BlastRadiusGraph layout and risk classification tests`

### Task 3: Add BlastRadiusGraph SVG component (JSX rendering)

**Depends on:** Task 1
**Files:** `packages/dashboard/src/client/components/BlastRadiusGraph.tsx`

1. Append the React component to the bottom of `packages/dashboard/src/client/components/BlastRadiusGraph.tsx`. The file already has the layout logic from Task 1. Add the following after the `computeBlastRadiusLayout` function:

   ```typescript
   // --- Summary bar ---
   function SummaryBar({ data }: { data: BlastRadiusData }) {
     const { summary } = data;
     const badges: { label: string; count: number; color: string }[] = [
       { label: 'Total Affected', count: summary.totalAffected, color: '#d1d5db' },
       { label: 'High Risk', count: summary.highRisk, color: RISK_COLORS.high },
       { label: 'Medium Risk', count: summary.mediumRisk, color: RISK_COLORS.medium },
       { label: 'Low Risk', count: summary.lowRisk, color: RISK_COLORS.low },
     ];

     return (
       <div className="mb-4 flex flex-wrap items-center gap-4">
         {badges.map((b) => (
           <div key={b.label} className="flex items-center gap-1.5">
             <span
               className="inline-block h-2.5 w-2.5 rounded-full"
               style={{ background: b.color }}
             />
             <span className="text-sm tabular-nums text-gray-300">
               {b.count}
             </span>
             <span className="text-xs text-gray-500">{b.label}</span>
           </div>
         ))}
         <div className="flex items-center gap-1.5">
           <span className="text-xs text-gray-500">Max Depth:</span>
           <span className="text-sm tabular-nums text-gray-300">{summary.maxDepth}</span>
         </div>
       </div>
     );
   }

   // --- Main component ---
   interface BlastRadiusGraphProps {
     data: BlastRadiusData;
   }

   export function BlastRadiusGraph({ data }: BlastRadiusGraphProps) {
     const layout = computeBlastRadiusLayout(data);

     if (!layout) {
       return (
         <div className="flex h-32 items-center justify-center rounded border border-gray-800 bg-gray-950">
           <p className="text-sm text-gray-500">No affected nodes</p>
         </div>
       );
     }

     const nodeMap = new Map(layout.nodes.map((n) => [n.nodeId, n]));
     const depthLabels = data.layers.map((l) => l.depth);

     return (
       <div>
         <SummaryBar data={data} />
         <div className="overflow-x-auto rounded border border-gray-700 bg-gray-950 p-4">
           <svg
             width={layout.width}
             height={layout.height}
             className="overflow-visible"
           >
             <defs>
               <marker
                 id="blast-arrow"
                 markerWidth="8"
                 markerHeight="8"
                 refX="6"
                 refY="3"
                 orient="auto"
               >
                 <path d="M0,0 L0,6 L8,3 z" fill="#4b5563" />
               </marker>
             </defs>

             {/* Depth column labels */}
             <text
               x={SOURCE_COL_X + NODE_W / 2}
               y={PADDING.top - 14}
               textAnchor="middle"
               fontSize={10}
               fill="#6b7280"
             >
               Source
             </text>
             {depthLabels.map((d) => {
               const colX = SOURCE_COL_X + d * COL_GAP;
               return (
                 <text
                   key={d}
                   x={colX + NODE_W / 2}
                   y={PADDING.top - 14}
                   textAnchor="middle"
                   fontSize={10}
                   fill="#6b7280"
                 >
                   Depth {d}
                 </text>
               );
             })}

             {/* Edges */}
             {layout.edges.map((edge) => {
               const from = nodeMap.get(edge.fromId);
               const to = nodeMap.get(edge.toId);
               if (!from || !to) return null;
               const x1 = from.x + NODE_W;
               const y1 = from.y + NODE_H / 2;
               const x2 = to.x;
               const y2 = to.y + NODE_H / 2;
               return (
                 <line
                   key={`${edge.fromId}-${edge.toId}`}
                   x1={x1}
                   y1={y1}
                   x2={x2 - 2}
                   y2={y2}
                   stroke="#4b5563"
                   strokeWidth={1}
                   strokeOpacity={clampOpacity(to.probability)}
                   markerEnd="url(#blast-arrow)"
                 />
               );
             })}

             {/* Nodes */}
             {layout.nodes.map((n) => (
               <g key={n.nodeId} opacity={clampOpacity(n.probability)}>
                 <rect
                   x={n.x}
                   y={n.y}
                   width={NODE_W}
                   height={NODE_H}
                   rx={4}
                   fill="#1f2937"
                   stroke={RISK_COLORS[n.risk]}
                   strokeWidth={1.5}
                 />
                 <text
                   x={n.x + NODE_W / 2}
                   y={n.y + NODE_H / 2}
                   dominantBaseline="middle"
                   textAnchor="middle"
                   fontSize={10}
                   fill="#d1d5db"
                 >
                   {n.name.length > 16 ? n.name.slice(0, 15) + '\u2026' : n.name}
                 </text>
                 <text
                   x={n.x + NODE_W - 4}
                   y={n.y + NODE_H - 4}
                   textAnchor="end"
                   fontSize={8}
                   fill="#9ca3af"
                 >
                   {n.type === 'source' ? '' : `${(n.probability * 100).toFixed(0)}%`}
                 </text>
               </g>
             ))}
           </svg>
         </div>
       </div>
     );
   }
   ```

2. Run: `npx tsc --noEmit -p packages/dashboard/tsconfig.json 2>&1 | head -20` -- verify no type errors.
3. Run: `npx vitest run tests/client/components/BlastRadiusGraph.test.ts` -- existing tests still pass.
4. Run: `harness validate`
5. Commit: `feat(dashboard): add BlastRadiusGraph SVG component with depth columns and risk coloring`

### Task 4: Wire BlastRadiusGraph into Impact.tsx

**Depends on:** Task 3
**Files:** `packages/dashboard/src/client/pages/Impact.tsx`

1. Add import at the top of `packages/dashboard/src/client/pages/Impact.tsx` (after the existing imports):

   ```typescript
   import { BlastRadiusGraph } from '../components/BlastRadiusGraph';
   ```

2. Replace the JSON dump section (the `<div>` containing the `<pre>` with `JSON.stringify(brData.layers, ...)` at lines 265-272) with the BlastRadiusGraph component. Specifically, replace:

   ```tsx
   <div className="rounded border border-gray-700 bg-gray-950 p-4">
     <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
       Propagation Layers (depth: {brData.summary.maxDepth})
     </p>
     <pre className="max-h-80 overflow-auto text-xs text-gray-400">
       {JSON.stringify(brData.layers, null, 2)}
     </pre>
   </div>
   ```

   With:

   ```tsx
   <BlastRadiusGraph data={brData} />
   ```

3. Also remove the summary bar KPI cards that are currently hardcoded in Impact.tsx (lines 237-262), since the BlastRadiusGraph component now includes its own SummaryBar. Replace the entire success block content:

   Find the block starting with:

   ```tsx
          {blastRadius.state === 'success' && brIsData && (
            <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
              <h3 className="mb-3 text-sm font-semibold text-gray-200">
                Blast Radius: {brData.sourceName}
              </h3>
              <div className="mb-4 grid grid-cols-4 gap-3">
   ```

   Replace the entire content of this conditional with:

   ```tsx
   {
     blastRadius.state === 'success' && brIsData && (
       <div className="rounded-lg border border-gray-800 bg-gray-900 p-6">
         <h3 className="mb-3 text-sm font-semibold text-gray-200">
           Blast Radius: {brData.sourceName}
         </h3>
         <BlastRadiusGraph data={brData} />
       </div>
     );
   }
   ```

4. Run: `npx tsc --noEmit -p packages/dashboard/tsconfig.json 2>&1 | head -20` -- verify no type errors.
5. Run: `npx vitest run tests/client/components/BlastRadiusGraph.test.ts` -- all tests pass.
6. Run: `harness validate`
7. Commit: `feat(dashboard): wire BlastRadiusGraph into Impact page, replace JSON dump`

### Task 5: Add rendering tests for BlastRadiusGraph component

[checkpoint:human-verify] -- verify the SVG renders correctly in the browser before finalizing

**Depends on:** Task 3, Task 4
**Files:** `packages/dashboard/tests/client/components/BlastRadiusGraph.test.ts`

1. Add rendering tests to the existing test file. Append the following describe block:

   ```typescript
   import { render, screen } from '@testing-library/react';
   import { BlastRadiusGraph } from '../../../src/client/components/BlastRadiusGraph';
   ```

   (Move the `@testing-library/react` import to the top of the file alongside the vitest imports.)

   ```typescript
   describe('BlastRadiusGraph component', () => {
     it('renders "No affected nodes" when layers are empty', () => {
       const data = makeTestData({ layers: [] });
       render(<BlastRadiusGraph data={data} />);
       expect(screen.getByText('No affected nodes')).toBeDefined();
     });

     it('renders an SVG element when layers have nodes', () => {
       const data = makeTestData();
       const { container } = render(<BlastRadiusGraph data={data} />);
       const svg = container.querySelector('svg');
       expect(svg).not.toBeNull();
     });

     it('renders summary bar with risk counts', () => {
       const data = makeTestData();
       render(<BlastRadiusGraph data={data} />);
       expect(screen.getByText('Total Affected')).toBeDefined();
       expect(screen.getByText('High Risk')).toBeDefined();
       expect(screen.getByText('Medium Risk')).toBeDefined();
       expect(screen.getByText('Low Risk')).toBeDefined();
     });

     it('renders depth labels', () => {
       const data = makeTestData();
       const { container } = render(<BlastRadiusGraph data={data} />);
       const texts = Array.from(container.querySelectorAll('text'));
       const depthTexts = texts.filter((t) => t.textContent?.startsWith('Depth'));
       expect(depthTexts).toHaveLength(2); // Depth 1, Depth 2
     });

     it('renders source label', () => {
       const data = makeTestData();
       const { container } = render(<BlastRadiusGraph data={data} />);
       const texts = Array.from(container.querySelectorAll('text'));
       const sourceLabel = texts.find((t) => t.textContent === 'Source');
       expect(sourceLabel).toBeDefined();
     });

     it('renders node rectangles for each node', () => {
       const data = makeTestData();
       const { container } = render(<BlastRadiusGraph data={data} />);
       // 1 source + 2 depth-1 + 1 depth-2 = 4 nodes, each with a rect
       const rects = container.querySelectorAll('rect');
       expect(rects.length).toBe(4);
     });

     it('renders edges as lines', () => {
       const data = makeTestData();
       const { container } = render(<BlastRadiusGraph data={data} />);
       const lines = container.querySelectorAll('line');
       expect(lines.length).toBe(3); // 3 edges
     });
   });
   ```

2. Run: `npx vitest run tests/client/components/BlastRadiusGraph.test.ts`
3. Observe: all tests pass (both the unit tests from Task 2 and the rendering tests).
4. Run: `harness validate`
5. Commit: `test(dashboard): add BlastRadiusGraph rendering tests`

## Acceptance Traceability

| Observable Truth                            | Delivered By                                                                 |
| ------------------------------------------- | ---------------------------------------------------------------------------- |
| 1. SVG with source node and depth columns   | Task 3 (component), Task 5 (rendering test)                                  |
| 2. Node opacity proportional to probability | Task 1 (clampOpacity), Task 3 (opacity attr on `<g>`)                        |
| 3. Risk-colored node strokes                | Task 1 (classifyRisk, RISK_COLORS), Task 3 (stroke attr), Task 2 (unit test) |
| 4. Parent-child edges                       | Task 1 (edges in layout), Task 3 (SVG lines), Task 2 (edge test)             |
| 5. Depth column labels                      | Task 3 (depth labels in SVG), Task 5 (rendering test)                        |
| 6. Summary bar above graph                  | Task 3 (SummaryBar component), Task 5 (rendering test)                       |
| 7. Empty layers message                     | Task 3 (null layout check), Task 5 (rendering test)                          |
| 8. JSON dump replaced                       | Task 4 (Impact.tsx modification)                                             |
| 9. Tests pass                               | Task 2, Task 5                                                               |
| 10. harness validate passes                 | Every task                                                                   |
