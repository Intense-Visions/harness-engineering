import type { NodeType } from '../types.js';

/** Node types representing knowledge entries (as opposed to code or structural nodes). */
export const KNOWLEDGE_NODE_TYPES: readonly NodeType[] = [
  'business_fact',
  'business_rule',
  'business_process',
  'business_term',
  'business_concept',
  'business_metric',
  'design_token',
  'design_constraint',
  'aesthetic_intent',
  'image_annotation',
];
