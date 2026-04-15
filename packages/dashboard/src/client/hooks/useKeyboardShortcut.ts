import { useEffect } from 'react';

interface Options {
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
}

/**
 * Hook to register a global keyboard shortcut.
 * If both ctrl and meta are true, it acts as "Cmd on Mac OR Ctrl on other platforms".
 */
export function useKeyboardShortcut(key: string, callback: () => void, options: Options = {}) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isKey = e.key.toLowerCase() === key.toLowerCase();
      
      // If both are true, we want EITHER Cmd OR Ctrl (platform agnostic "Primary")
      const platformMatch = (options.meta && options.ctrl) 
        ? (e.metaKey || e.ctrlKey)
        : ((options.meta === undefined || e.metaKey === options.meta) && 
           (options.ctrl === undefined || e.ctrlKey === options.ctrl));

      const isShift = options.shift === undefined || e.shiftKey === options.shift;

      if (isKey && platformMatch && isShift) {
        // Only prevent default if we matched everything
        e.preventDefault();
        callback();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [key, callback, options.ctrl, options.meta, options.shift]);
}
