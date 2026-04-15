import { useEffect } from 'react';

interface Options {
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

function matchesPlatformModifier(e: KeyboardEvent, options: Options): boolean {
  if (options.meta && options.ctrl) {
    return e.metaKey || e.ctrlKey;
  }
  if (options.meta !== undefined && e.metaKey !== options.meta) return false;
  if (options.ctrl !== undefined && e.ctrlKey !== options.ctrl) return false;
  return true;
}

function matchesShortcut(e: KeyboardEvent, key: string, options: Options): boolean {
  if (e.key.toLowerCase() !== key.toLowerCase()) return false;
  if (!matchesPlatformModifier(e, options)) return false;
  if (options.shift !== undefined && e.shiftKey !== options.shift) return false;
  return true;
}

/**
 * Hook to register a global keyboard shortcut.
 * If both ctrl and meta are true, it acts as "Cmd on Mac OR Ctrl on other platforms".
 */
export function useKeyboardShortcut(key: string, callback: () => void, options: Options = {}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!matchesShortcut(e, key, options)) return;
      e.preventDefault();
      callback();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [key, callback, options.ctrl, options.meta, options.shift]);
}
