import type { TrajectoryKind } from "../types";

interface TrajectoryTogglesProps {
  visible: Record<TrajectoryKind, boolean>;
  onToggle: (kind: TrajectoryKind) => void;
  activeKind: TrajectoryKind;
  onActiveKindChange: (kind: TrajectoryKind) => void;
}

const LABELS: Record<TrajectoryKind, { label: string; color: string }> = {
  fastest: { label: "Fastest (red)", color: "#FF4444" },
  cheapest: { label: "Cheapest (blue)", color: "#4488FF" },
  balanced: { label: "Balanced (green)", color: "#44CC66" },
};

export default function TrajectoryToggles({
  visible,
  onToggle,
  activeKind,
  onActiveKindChange,
}: TrajectoryTogglesProps) {
  return (
    <div className="trajectory-toggles" data-tour="trajectories">
      <h3>Trajectories</h3>
      {(Object.keys(LABELS) as TrajectoryKind[]).map((kind) => (
        <label
          key={kind}
          className="toggle-row"
          onMouseEnter={() => onActiveKindChange(kind)}
          style={{ opacity: activeKind === kind ? 1 : 0.75 }}
        >
          <input
            type="checkbox"
            checked={visible[kind]}
            onChange={() => onToggle(kind)}
            onFocus={() => onActiveKindChange(kind)}
          />
          <span className="color-dot" style={{ background: LABELS[kind].color }} />
          <span
            role="button"
            tabIndex={0}
            onClick={() => onActiveKindChange(kind)}
            onKeyDown={(e) => e.key === "Enter" && onActiveKindChange(kind)}
          >
            {LABELS[kind].label}
          </span>
        </label>
      ))}
    </div>
  );
}
