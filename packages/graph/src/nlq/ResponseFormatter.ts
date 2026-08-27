import type { Intent, ResolvedEntity, StalenessQueryResult } from './types.js';

/**
 * Template-based response formatter that generates human-readable summaries
 * from graph operation results, one template per intent.
 */
export class ResponseFormatter {
  /**
   * Format graph operation results into a human-readable summary.
   *
   * @param intent - The classified intent
   * @param entities - Resolved entities from the query
   * @param data - Raw result data (shape varies per intent)
   * @param query - Original natural language query (optional)
   * @returns Human-readable summary string
   */
  format(
    intent: Intent,
    entities: readonly ResolvedEntity[],
    data: unknown,
    query?: string
  ): string {
    // For shortestPath a null result is a meaningful answer (unreachable), so
    // let its own formatter phrase it rather than the generic guard below.
    if ((data === null || data === undefined) && intent !== 'shortestPath') {
      return 'No results found.';
    }

    const firstEntity = entities[0] as ResolvedEntity | undefined;
    const entityName = firstEntity?.raw ?? 'the target';

    switch (intent) {
      case 'impact':
        return this.formatImpact(entityName, data);
      case 'find':
        return this.formatFind(data, query);
      case 'relationships':
        return this.formatRelationships(entityName, entities, data);
      case 'explain':
        return this.formatExplain(entityName, entities, data);
      case 'anomaly':
        return this.formatAnomaly(data);
      case 'staleness':
        return this.formatStaleness(data);
      case 'shortestPath':
        return this.formatShortestPath(entities, data);
      default:
        return `Processed results for "${entityName}".`;
    }
  }

  private formatStaleness(data: unknown): string {
    const d = data as Partial<StalenessQueryResult> | null;
    const stale = Array.isArray(d?.stale) ? d.stale : [];

    if (stale.length === 0) {
      return 'Found 0 stale learnings — no learning cites a deleted source file.';
    }

    const top = stale
      .slice(0, 3)
      .map((s) => {
        const refs = s.missingReferences.slice(0, 2).join(', ');
        return refs ? `${s.nodeId} (missing: ${refs})` : s.nodeId;
      })
      .join('; ');

    return `Found ${this.p(stale.length, 'stale learning', 'stale learnings')} whose cited source files no longer exist — re-verify: ${top}.`;
  }

  private formatShortestPath(entities: readonly ResolvedEntity[], data: unknown): string {
    const source = (entities[0] as ResolvedEntity | undefined)?.raw ?? 'the source';
    const target = (entities[1] as ResolvedEntity | undefined)?.raw ?? 'the target';

    // Unreachable pairs return null from the primitive.
    if (data === null || data === undefined) {
      return `No path found between **${source}** and **${target}**.`;
    }

    const d = data as { length?: number; nodes?: Array<{ id?: string }> };
    const length = typeof d.length === 'number' ? d.length : 0;
    const nodes = Array.isArray(d.nodes) ? d.nodes : [];

    if (length === 0) {
      return `**${source}** and **${target}** are the same node.`;
    }

    const trail = nodes.map((n) => n.id ?? '?').join(' → ');
    return `Shortest path from **${source}** to **${target}**: ${this.p(length, 'hop')} (${trail}).`;
  }

  private formatImpact(entityName: string, data: unknown): string {
    const d = data as Record<string, unknown>;

    // CascadeResult shape: has sourceNodeId, layers, flatSummary, summary
    if ('sourceNodeId' in d && 'summary' in d) {
      const summary = d.summary as {
        totalAffected: number;
        highRisk: number;
        mediumRisk: number;
        lowRisk: number;
      };
      return `Blast radius of **${entityName}**: ${summary.totalAffected} affected nodes (${summary.highRisk} high risk, ${summary.mediumRisk} medium, ${summary.lowRisk} low).`;
    }

    // Legacy groupNodesByImpact shape: { code, tests, docs, other }
    const code = this.safeArrayLength(d?.code);
    const tests = this.safeArrayLength(d?.tests);
    const docs = this.safeArrayLength(d?.docs);
    return `Changing **${entityName}** affects ${this.p(code, 'code file')}, ${this.p(tests, 'test')}, and ${this.p(docs, 'doc')}.`;
  }

  private formatFind(data: unknown, query?: string): string {
    const count = Array.isArray(data) ? data.length : 0;
    if (query) {
      return `Found ${this.p(count, 'match', 'matches')} for "${query}".`;
    }
    return `Found ${this.p(count, 'match', 'matches')}.`;
  }

  private formatRelationships(
    entityName: string,
    entities: readonly ResolvedEntity[],
    data: unknown
  ): string {
    const d = data as { nodes?: unknown[]; edges?: Array<{ from: string; to: string }> };
    const edges = Array.isArray(d?.edges) ? d.edges : [];
    const firstEntity = entities[0] as ResolvedEntity | undefined;
    const rootId = firstEntity?.nodeId ?? '';

    let outbound = 0;
    let inbound = 0;
    for (const edge of edges) {
      if (edge.from === rootId) outbound++;
      if (edge.to === rootId) inbound++;
    }

    return `**${entityName}** has ${outbound} outbound and ${inbound} inbound relationships.`;
  }

  private formatExplain(
    entityName: string,
    entities: readonly ResolvedEntity[],
    data: unknown
  ): string {
    const d = data as { context?: Array<{ nodes?: unknown[] }> };
    const context = Array.isArray(d?.context) ? d.context : [];

    const firstEntity = entities[0] as ResolvedEntity | undefined;
    const nodeType = firstEntity?.node.type ?? 'node';
    const path = firstEntity?.node.path ?? 'unknown';

    let neighborCount = 0;
    const firstContext = context[0] as { nodes?: unknown[] } | undefined;
    if (firstContext && Array.isArray(firstContext.nodes)) {
      neighborCount = firstContext.nodes.length;
    }

    return `**${entityName}** is a ${nodeType} at \`${path}\`. Connected to ${neighborCount} nodes.`;
  }

  private formatAnomaly(data: unknown): string {
    const d = data as {
      statisticalOutliers?: Array<{ nodeId?: string; metric?: string }>;
      articulationPoints?: Array<{ nodeId?: string }>;
      summary?: { totalOutliers?: number; totalArticulationPoints?: number };
    };
    const outliers = Array.isArray(d?.statisticalOutliers) ? d.statisticalOutliers : [];
    const artPoints = Array.isArray(d?.articulationPoints) ? d.articulationPoints : [];
    const count = outliers.length + artPoints.length;

    if (count === 0) {
      return 'Found 0 anomalies.';
    }

    const topItems = [
      ...outliers.slice(0, 2).map((o) => o.nodeId ?? 'unknown outlier'),
      ...artPoints.slice(0, 1).map((a) => a.nodeId ?? 'unknown bottleneck'),
    ].join(', ');

    return `Found ${this.p(count, 'anomaly', 'anomalies')}: ${topItems}.`;
  }

  private safeArrayLength(value: unknown): number {
    return Array.isArray(value) ? value.length : 0;
  }

  private p(count: number, singular: string, plural?: string): string {
    const word = count === 1 ? singular : (plural ?? singular + 's');
    return `${count} ${word}`;
  }
}
