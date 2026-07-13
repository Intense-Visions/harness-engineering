import { useAnalyze } from '../components/analyze/useAnalyze';
import { AnalyzeForm } from '../components/analyze/AnalyzeForm';
import { AnalyzeResults } from '../components/analyze/AnalyzeResults';
import {
  AnalyzeHeader,
  AnalyzeStatus,
  AnalyzeError,
  AnalyzeEmptyState,
} from '../components/analyze/AnalyzeStates';

export function Analyze() {
  const analyze = useAnalyze();
  const {
    title,
    setTitle,
    description,
    setDescription,
    labels,
    setLabels,
    streaming,
    status,
    error,
    hasResults,
    handleSubmit,
    handleCancel,
  } = analyze;

  return (
    <div className="space-y-6">
      <AnalyzeHeader />

      <AnalyzeForm
        title={title}
        description={description}
        labels={labels}
        streaming={streaming}
        onTitleChange={setTitle}
        onDescriptionChange={setDescription}
        onLabelsChange={setLabels}
        onSubmit={() => void handleSubmit()}
        onCancel={handleCancel}
      />

      <AnalyzeStatus status={status} />

      {error && <AnalyzeError error={error} />}

      {hasResults && <AnalyzeResults analyze={analyze} />}

      {!hasResults && !streaming && !error && <AnalyzeEmptyState />}
    </div>
  );
}
