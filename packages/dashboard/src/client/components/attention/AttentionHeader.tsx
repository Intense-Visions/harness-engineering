import { Search, X } from 'lucide-react';

export function AttentionHeader({
  searchQuery,
  onSearchChange,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="text-2xl font-bold">Needs Attention</h1>
      <div className="relative w-full max-w-sm">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <Search className="h-4 w-4 text-gray-500" />
        </div>
        <input
          type="text"
          className="block w-full rounded-lg border border-gray-800 bg-gray-900 py-2 pl-10 pr-10 text-sm text-white placeholder-gray-500 transition-all focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
          placeholder="Search escalations..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <button
            className="absolute inset-y-0 right-0 flex items-center pr-3 text-gray-500 hover:text-gray-300"
            onClick={() => onSearchChange('')}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
