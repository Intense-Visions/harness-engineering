// packages/core/src/entropy/types/drift.ts

export interface DocumentationDrift {
  type: 'api-signature' | 'example-code' | 'structure';
  docFile: string;
  line: number;
  reference: string;
  context: string;
  issue: 'NOT_FOUND' | 'RENAMED' | 'SIGNATURE_CHANGED' | 'SYNTAX_ERROR' | 'IMPORT_ERROR';
  details: string;
  suggestion?: string;
  possibleMatches?: string[];
  confidence: 'high' | 'medium' | 'low';
}

export interface DriftReport {
  drifts: DocumentationDrift[];
  stats: {
    docsScanned: number;
    referencesChecked: number;
    driftsFound: number;
    byType: { api: number; example: number; structure: number };
  };
  severity: 'high' | 'medium' | 'low' | 'none';
}
