export interface TokenBudget {
  total: number;
  systemPrompt: number;
  projectManifest: number;
  taskSpec: number;
  activeCode: number;
  interfaces: number;
  reserve: number;
}

export interface TokenBudgetOverrides {
  systemPrompt?: number;
  projectManifest?: number;
  taskSpec?: number;
  activeCode?: number;
  interfaces?: number;
  reserve?: number;
}
