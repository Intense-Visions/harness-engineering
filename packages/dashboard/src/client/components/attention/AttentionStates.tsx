import { Loader2 } from 'lucide-react';

export function AttentionLoading() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-2 text-gray-500">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Loading interactions...</p>
      </div>
    </div>
  );
}

export function AttentionEmpty({
  searchQuery,
  onClearSearch,
}: {
  searchQuery: string;
  onClearSearch: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-gray-800 bg-gray-900/20 p-12 text-center">
      <div>
        <p className="text-sm text-gray-500">
          {searchQuery
            ? 'No interactions match your search.'
            : 'No interactions require attention.'}
        </p>
        {searchQuery && (
          <button
            onClick={onClearSearch}
            className="mt-2 text-xs font-semibold text-primary-500 hover:text-primary-400"
          >
            Clear search
          </button>
        )}
      </div>
    </div>
  );
}
