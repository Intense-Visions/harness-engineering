// Mirror of packages/dashboard/src/server/signals/types.ts (SignalResult, SignalPoint).
// Kept in client/types because client code must not import from src/server.
export type SignalStatus = 'ok' | 'warn' | 'alert' | 'pending' | 'error';

export interface SignalPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface SignalResult {
  id: string;
  label: string;
  value: number | null;
  unit: string;
  trend: 'up' | 'down' | 'flat';
  betterDirection: 'up' | 'down';
  status: SignalStatus;
  threshold: { warn: number; alert: number };
  history: SignalPoint[];
  detail: string;
  source: string;
}

export interface SignalsResult {
  signals: SignalResult[];
  generatedAt: string;
}
