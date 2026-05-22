interface CalculationProgressProps {
  progress: number;
  stage?: string | null;
}

export default function CalculationProgress({
  progress,
  stage,
}: CalculationProgressProps) {
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  const label = stage?.trim() || "Calculating trajectory...";

  return (
    <div
      className="calculation-progress"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="progress-label">
        {pct}% — {label}
      </span>
    </div>
  );
}
