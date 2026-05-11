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
