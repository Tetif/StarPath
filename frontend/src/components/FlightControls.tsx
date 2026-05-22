import { useState } from "react";

import type { TrajectoryKind } from "../types";
import { useScene } from "../context/SceneContext";
import {
  clampTime,
  ensureClockRange,
  lerpTime,
  parseDatetimeLocal,
  toDatetimeLocal,
} from "../lib/time";

interface FlightControlsProps {
  activeKind: TrajectoryKind;
  hasTrajectories: boolean;
}

const MULTIPLIERS = [1, 100, 1000, 10000, 100000, 1000000];

function formatUtcLabel(date: Date): string {
  return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
}

function timeToSliderValue(time: Date, start: Date, stop: Date): number {
  const span = stop.getTime() - start.getTime();
  if (span <= 0) return 0;
  return (time.getTime() - start.getTime()) / span;
}

export default function FlightControls({ activeKind, hasTrajectories }: FlightControlsProps) {
  const {
    playing,
    setPlaying,
    multiplier,
    setMultiplier,
    setChaseKind,
    chaseKind,
    startFlightDemo,
    snapCraftChaseForKind,
    focusOnStarship,
    hasStarshipAtCurrentTime,
    vehicleId,
    syncClockToTrajectories,
    flyToTrajectories,
    currentTime,
    setCurrentTime,
    clockStart,
    clockStop,
    setClockRange,
  } = useScene();

  const [collapsed, setCollapsed] = useState(false);
  const chasing = chaseKind !== null;

  const togglePlay = () => setPlaying(!playing);

  const watchFlight = () => {
    startFlightDemo(activeKind);
  };

  const focusStarship = () => {
    focusOnStarship(activeKind);
  };

  const starshipFocusActive = chaseKind === activeKind && chasing;
  const canFocusStarship =
    hasTrajectories && vehicleId === "starship" && hasStarshipAtCurrentTime;

  const toggleChase = () => {
    if (chaseKind) {
      setChaseKind(null);
    } else {
      setChaseKind(activeKind);
      snapCraftChaseForKind(activeKind);
      setPlaying(true);
    }
  };

  const cinematic = () => {
    syncClockToTrajectories();
    flyToTrajectories(2);
  };

  const applyClockRange = (start: Date, stop: Date) => {
    const range = ensureClockRange(start, stop);
    setClockRange(range.start, range.stop);
    setCurrentTime(clampTime(currentTime, range.start, range.stop));
    setPlaying(false);
  };

  const handleStartChange = (value: string) => {
    if (!value) return;
    applyClockRange(parseDatetimeLocal(value), clockStop);
  };

  const handleStopChange = (value: string) => {
    if (!value) return;
    applyClockRange(clockStart, parseDatetimeLocal(value));
  };

  const handleDateChange = (value: string) => {
    if (!value) return;
    const next = clampTime(parseDatetimeLocal(value), clockStart, clockStop);
    setCurrentTime(next);
    setPlaying(false);
  };

  const handleSliderChange = (value: number) => {
    const next = lerpTime(clockStart, clockStop, value);
    setCurrentTime(next);
    setPlaying(false);
  };

  const sliderValue = timeToSliderValue(currentTime, clockStart, clockStop);

  return (
    <div
      className={`scene-overlay flight-controls${collapsed ? " flight-controls--collapsed" : ""}`}
      data-tour="timeline"
    >
      <button
        type="button"
        className="panel-collapse-btn panel-collapse-btn--down"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Show playback controls" : "Hide playback controls"}
        title={collapsed ? "Show playback controls" : "Hide playback controls"}
      >
        {collapsed ? "▲" : "▼"}
      </button>

      {!collapsed && (
      <>
      <div className="flight-controls-row">
        <button type="button" className={playing ? "active" : ""} onClick={togglePlay}>
          {playing ? "Pause" : "Play"}
        </button>
        {hasTrajectories && (
          <>
            <button type="button" onClick={watchFlight}>
              Watch flight
            </button>
            <button type="button" className={chasing ? "active" : ""} onClick={toggleChase}>
              {chasing ? "Stop chase" : "Chase craft"}
            </button>
            <button
              type="button"
              className={starshipFocusActive ? "active" : ""}
              onClick={focusStarship}
              disabled={!canFocusStarship}
              title="Навести камеру на Starship и включить слежение"
            >
              На Starship
            </button>
            <button type="button" onClick={cinematic}>
              Cinematic
            </button>
          </>
        )}
        <span className="flight-controls-label">Speed:</span>
        <div className="multiplier-buttons">
          {MULTIPLIERS.map((m) => (
            <button
              key={m}
              type="button"
              className={m === multiplier ? "active" : ""}
              onClick={() => setMultiplier(m)}
            >
              ×{m >= 1000000 ? "10⁶" : m.toLocaleString()}
            </button>
          ))}
        </div>
      </div>

      <div className="flight-controls-row timeline-row timeline-range-row">
        <label className="timeline-date-label" htmlFor="sim-range-start">
          Start
        </label>
        <input
          id="sim-range-start"
          type="datetime-local"
          value={toDatetimeLocal(clockStart)}
          onChange={(e) => handleStartChange(e.target.value)}
        />
        <label className="timeline-date-label" htmlFor="sim-range-stop">
          End
        </label>
        <input
          id="sim-range-stop"
          type="datetime-local"
          value={toDatetimeLocal(clockStop)}
          min={toDatetimeLocal(clockStart)}
          onChange={(e) => handleStopChange(e.target.value)}
        />
      </div>

      <div className="flight-controls-row timeline-row">
        <label className="timeline-date-label" htmlFor="sim-datetime">
          Time
        </label>
        <input
          id="sim-datetime"
          type="datetime-local"
          value={toDatetimeLocal(currentTime)}
          min={toDatetimeLocal(clockStart)}
          max={toDatetimeLocal(clockStop)}
          onChange={(e) => handleDateChange(e.target.value)}
        />
        <span className="timeline-utc">{formatUtcLabel(currentTime)}</span>
      </div>

      <div className="flight-controls-row timeline-row">
        <input
          type="range"
          className="timeline-slider"
          min={0}
          max={1}
          step={0.0001}
          value={sliderValue}
          onChange={(e) => handleSliderChange(Number(e.target.value))}
          aria-label="Simulation timeline"
        />
      </div>
      </>
      )}
    </div>
  );
}
