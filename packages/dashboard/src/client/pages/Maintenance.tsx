import { useMaintenanceData } from '../components/maintenance/useMaintenanceData';
import { MaintenanceBanners } from '../components/maintenance/MaintenanceBanners';
import { MaintenanceContent } from '../components/maintenance/MaintenanceContent';

export function Maintenance() {
  const {
    status,
    history,
    schedule,
    scheduleError,
    inFlight,
    error,
    loading,
    connected,
    maintenanceEvent,
    handleRunNow,
  } = useMaintenanceData();

  // The active-task banner is derived from the in-flight Set so that it
  // accurately reflects ALL currently-running tasks, not just the most
  // recent maintenance:* event (which under-reported when two tasks ran
  // back-to-back).
  const inFlightList = [...inFlight];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Maintenance</h1>
          <span
            className={`inline-block h-2 w-2 rounded-full ${connected ? 'bg-emerald-400' : 'bg-gray-600'}`}
            title={connected ? 'WebSocket connected' : 'WebSocket disconnected'}
          />
        </div>
      </div>

      <MaintenanceBanners inFlightList={inFlightList} maintenanceEvent={maintenanceEvent} />

      {loading && !status && <p className="text-sm text-gray-500">Loading maintenance status...</p>}
      {error && <p className="text-sm text-red-400">{error}</p>}

      {status && history && (
        <MaintenanceContent
          status={status}
          history={history}
          schedule={schedule}
          scheduleError={scheduleError}
          inFlight={inFlight}
          onRunNow={handleRunNow}
        />
      )}
    </div>
  );
}
