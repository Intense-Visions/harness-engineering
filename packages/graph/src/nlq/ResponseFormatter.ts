import type { Intent, ResolvedEntity } from './types.js';

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
    if (data === null || data === undefined) {
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
      default:
        return `Processed results for "${entityName}".`;
    }
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
