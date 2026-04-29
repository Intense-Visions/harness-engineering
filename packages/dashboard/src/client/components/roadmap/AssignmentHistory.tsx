import type { DashboardAssignmentRecord } from '@shared/types';

interface Props {
  records: DashboardAssignmentRecord[];
}

const ACTION_COLORS: Record<string, string> = {
  assigned: 'text-blue-400',
  completed: 'text-emerald-400',
  unassigned: 'text-gray-400',
};

export function AssignmentHistory({ records }: Props) {
  if (records.length === 0) return null;

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900">
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="border-b border-gray-800 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
            <th className="px-4 py-2.5">Feature</th>
            <th className="px-4 py-2.5">Assignee</th>
            <th className="px-4 py-2.5">Action</th>
            <th className="px-4 py-2.5">Date</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, i) => (
            <tr
              key={i}
              className="border-t border-gray-800/50 hover:bg-gray-800/30 transition-colors"
            >
              <td className="px-4 py-2 text-gray-300">{r.feature}</td>
              <td className="px-4 py-2 text-gray-400">{r.assignee}</td>
              <td className={`px-4 py-2 capitalize ${ACTION_COLORS[r.action] ?? 'text-gray-400'}`}>
                {r.action}
              </td>
              <td className="px-4 py-2 text-gray-500">{r.date}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
