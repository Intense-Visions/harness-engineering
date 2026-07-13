import { KpiCard } from '../KpiCard';
import { HistoryTable, ScheduleTable, formatTime } from './MaintenanceTables';
import type { HistoryEntry, ScheduleRow, SchedulerStatus } from './useMaintenanceData';

function ScheduleSection({
  schedule,
  scheduleError,
  inFlight,
  onRunNow,
}: {
  schedule: ScheduleRow[] | null;
  scheduleError: string | null;
  inFlight: Set<string>;
  onRunNow: (taskId: string) => void;
}) {
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
        Schedule
      </h2>
      {scheduleError && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2">
          <span className="text-sm text-red-300">{scheduleError}</span>
        </div>
      )}
      {schedule ? (
        <ScheduleTable rows={schedule} inFlight={inFlight} onRunNow={onRunNow} />
      ) : scheduleError ? null : (
        <p className="text-sm text-gray-500">Loading schedule...</p>
      )}
    </section>
  );
}

export function MaintenanceContent({
  status,
  history,
  schedule,
  scheduleError,
  inFlight,
  onRunNow,
}: {
  status: SchedulerStatus;
  history: HistoryEntry[];
  schedule: ScheduleRow[] | null;
  scheduleError: string | null;
  inFlight: Set<string>;
  onRunNow: (taskId: string) => void;
}) {
  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
          Scheduler Status
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <KpiCard label="Scheduled Tasks" value={status.scheduledTasks} />
          <KpiCard label="Last Run" value={formatTime(status.lastRunAt)} />
          <KpiCard label="Next Run" value={formatTime(status.nextRunAt)} />
        </div>
      </section>

      <ScheduleSection
        schedule={schedule}
        scheduleError={scheduleError}
        inFlight={inFlight}
        onRunNow={onRunNow}
      />

      <section>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-gray-500">
          Run History
        </h2>
        <HistoryTable entries={history} />
      </section>
    </div>
  );
}
