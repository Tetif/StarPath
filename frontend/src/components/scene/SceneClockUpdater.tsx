import { useFrame } from "@react-three/fiber";
import { useRef } from "react";

import { useScene } from "../../context/SceneContext";
import { addSeconds } from "../../lib/time";

const UI_SYNC_MS = 250;

export default function SceneClockUpdater() {
  const {
    clockStop,
    currentTimeRef,
    playing,
    multiplier,
    setPlaying,
    syncCurrentTimeToUi,
  } = useScene();

  const lastUiSyncRef = useRef(0);

  useFrame((_state, delta) => {
    const stop = clockStop;
    const current = currentTimeRef.current;

    if (!playing) return;

    const advance = delta * multiplier;
    const next = addSeconds(current, advance);

    if (next.getTime() >= stop.getTime()) {
      currentTimeRef.current = stop;
      setPlaying(false);
      syncCurrentTimeToUi(stop);
      return;
    }

    currentTimeRef.current = next;

    const now = performance.now();
    if (now - lastUiSyncRef.current >= UI_SYNC_MS) {
      lastUiSyncRef.current = now;
      syncCurrentTimeToUi(next);
    }
  });

  return null;
}
