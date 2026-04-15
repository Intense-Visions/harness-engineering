import * as fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseRoadmap } from '@harness-engineering/core';
import {
  Result,
  Ok,
  Err,
  Issue,
  IssueTrackerClient,
  TrackerConfig,
  BlockerRef,
  RoadmapFeature,
} from '@harness-engineering/types';

/**
 * Adapter for using a markdown roadmap file as an issue tracker.
 *
 * This adapter parses a standard Harness roadmap file, extracts features,
 * and maps them to the internal Issue model using deterministic hashing
 * for identifiers.
 */
export class RoadmapTrackerAdapter implements IssueTrackerClient {
  private config: TrackerConfig;

  /**
   * Creates a new RoadmapTrackerAdapter.
   *
   * @param config - The tracker configuration including the file path
   */
  constructor(config: TrackerConfig) {
    this.config = config;
    if (!config.filePath) {
      throw new Error('RoadmapTrackerAdapter requires a filePath in TrackerConfig');
    }
  }

  /**
   * Fetches all issues that are in an "active" state according to the config.
   */
  async fetchCandidateIssues(): Promise<Result<Issue[], Error>> {
    return this.fetchIssuesByStates(this.config.activeStates);
  }

  /**
   * Fetches issues that match any of the given state names.
   *
   * @param stateNames - List of statuses to filter by
   */
  async fetchIssuesByStates(stateNames: string[]): Promise<Result<Issue[], Error>> {
    try {
      if (!this.config.filePath) return Err(new Error('Missing filePath'));
      const content = await fs.readFile(this.config.filePath, 'utf-8');
      const roadmapResult = parseRoadmap(content);
      if (!roadmapResult.ok) return roadmapResult as unknown as Result<Issue[], Error>;

      const issues: Issue[] = [];
      for (const milestone of roadmapResult.value.milestones) {
        for (const feature of milestone.features) {
          if (stateNames.includes(feature.status)) {
            issues.push(this.mapFeatureToIssue(feature));
          }
        }
      }

      return Ok(issues);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Fetches full issue details for a list of identifiers.
   *
   * @param issueIds - List of issue IDs to fetch
   */
  async fetchIssueStatesByIds(issueIds: string[]): Promise<Result<Map<string, Issue>, Error>> {
    try {
      if (!this.config.filePath) return Err(new Error('Missing filePath'));
      const content = await fs.readFile(this.config.filePath, 'utf-8');
      const roadmapResult = parseRoadmap(content);
      if (!roadmapResult.ok) return roadmapResult as unknown as Result<Map<string, Issue>, Error>;

      const issueMap = new Map<string, Issue>();
      for (const milestone of roadmapResult.value.milestones) {
        for (const feature of milestone.features) {
          const issue = this.mapFeatureToIssue(feature);
          if (issueIds.includes(issue.id)) {
            issueMap.set(issue.id, issue);
          }
        }
      }

      return Ok(issueMap);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Maps a raw RoadmapFeature from the parser to the unified Issue model.
   */
  private mapFeatureToIssue(feature: RoadmapFeature): Issue {
    const id = this.generateId(feature.name);
    return {
      id,
      identifier: id,
      title: feature.name,
      description: feature.summary,
      priority: null,
      state: feature.status,
      branchName: null,
      url: null,
      labels: [],
      spec: feature.spec,
      plans: feature.plans,
      blockedBy: feature.blockedBy.map((b: string) => ({
        id: this.generateId(b),
        identifier: b,
        state: null,
      })) as BlockerRef[],
      createdAt: null,
      updatedAt: null,
      externalId: feature.externalId ?? null,
    };
  }

  /**
   * Generates a deterministic, URL-safe identifier for a feature name.
   */
  private generateId(name: string): string {
    const hash = createHash('sha256').update(name).digest('hex').slice(0, 8);
    const sanitized = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 20);
    return `${sanitized}-${hash}`;
  }
}
