import { create } from 'zustand';

export interface ConflictToast {
  kind: 'conflict';
  externalId: string;
  conflictedWith: string | null;
  /** Monotonic counter so repeat conflicts re-trigger effects. */
  seq: number;
}

interface ToastStore {
  current: ConflictToast | null;
  /**
   * Push a new conflict toast, superseding any existing toast.
   *
   * Supersession contract:
   * - Each call increments the monotonic `seq` counter, so the consumer's
   *   useEffect (keyed on `current.seq`) re-fires even when the same
   *   externalId conflicts twice in a row.
   * - The previous toast (if any) is overwritten atomically via the
   *   Zustand `set()`; no "dismiss before push" race.
   * - Callers MUST NOT rely on per-externalId stacking; this is a
   *   single-toast model.
   */
  pushConflict: (input: { externalId: string; conflictedWith: string | null }) => void;
  clear: () => void;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  current: null,
  pushConflict: ({ externalId, conflictedWith }) => {
    const prevSeq = get().current?.seq ?? 0;
    set({
      current: {
        kind: 'conflict',
        externalId,
        conflictedWith,
        seq: prevSeq + 1,
      },
    });
  },
  clear: () => set({ current: null }),
}));
