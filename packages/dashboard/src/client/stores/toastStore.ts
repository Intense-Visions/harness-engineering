import { create } from 'zustand';

export interface ConflictToast {
  kind: 'conflict';
  externalId: string;
  conflictedWith: string | null;
  /** Monotonic counter so repeat conflicts re-trigger effects. */
  seq: number;
}

/**
 * A transient success confirmation (e.g. an item was authored into the
 * roadmap). Kept in a slot separate from {@link ConflictToast.current} so
 * success feedback never supersedes — and is never superseded by — a
 * TRACKER_CONFLICT toast: the two are independent, mutually-exclusive moments
 * and the `current` conflict slot keeps its original type/contract intact.
 */
export interface SuccessToast {
  kind: 'success';
  message: string;
  /** Monotonic counter so repeat successes re-trigger consumer effects. */
  seq: number;
}

interface ToastStore {
  current: ConflictToast | null;
  /** Latest success confirmation, or null. Independent of {@link current}. */
  success: SuccessToast | null;
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
  /**
   * Push a success confirmation into the independent `success` slot. Same
   * monotonic-`seq` supersession contract as {@link pushConflict}.
   */
  pushSuccess: (input: { message: string }) => void;
  clear: () => void;
  /** Dismiss the current success confirmation without touching `current`. */
  clearSuccess: () => void;
}

export const useToastStore = create<ToastStore>((set, get) => ({
  current: null,
  success: null,
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
  pushSuccess: ({ message }) => {
    const prevSeq = get().success?.seq ?? 0;
    set({
      success: {
        kind: 'success',
        message,
        seq: prevSeq + 1,
      },
    });
  },
  clear: () => set({ current: null }),
  clearSuccess: () => set({ success: null }),
}));
