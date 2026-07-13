import { SELCard, CMLCard, PESLCard, SignalsBadges } from './AnalyzeCards';
import { AnalyzeActionBar } from './AnalyzeActionBar';
import type { AnalyzeController } from './useAnalyze';

/**
 * Renders the streamed analysis result cards plus the action bar. Only mounted
 * when the controller reports `hasResults`.
 */
export function AnalyzeResults({ analyze }: { analyze: AnalyzeController }) {
  const {
    selResult,
    cmlResult,
    peslResult,
    signals,
    isDone,
    actionState,
    actionError,
    handleAddToRoadmap,
    handleDispatchNow,
    handleRefine,
    handleExportSpec,
  } = analyze;

  return (
    <div className="space-y-4">
      {selResult && <SELCard data={selResult} />}
      {cmlResult && <CMLCard data={cmlResult} />}
      {signals && signals.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-gray-500">
            Concern Signals
          </h3>
          <SignalsBadges signals={signals} />
        </div>
      )}
      {peslResult && <PESLCard data={peslResult} />}

      {isDone && (
        <AnalyzeActionBar
          selResult={selResult}
          cmlResult={cmlResult}
          actionState={actionState}
          actionError={actionError}
          onAddToRoadmap={() => void handleAddToRoadmap()}
          onDispatchNow={() => void handleDispatchNow()}
          onRefine={handleRefine}
          onExportSpec={handleExportSpec}
        />
      )}
    </div>
  );
}
