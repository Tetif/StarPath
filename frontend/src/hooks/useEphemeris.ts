import { useEffect, useState } from "react";

import type { TaskResults } from "../types";

import type { EphemerisData } from "../lib/ephemeris";

import { fetchEphemerisSample, getMissionTimeRange } from "../lib/ephemeris";

import { getDefaultSimulationRange } from "../lib/time";

export function useEphemeris(results: TaskResults | null): EphemerisData | null {
  const [data, setData] = useState<EphemerisData | null>(null);

  useEffect(() => {
    const { start, stop } = getDefaultSimulationRange();
    const range = getMissionTimeRange(results) ?? {
      from: start.toISOString(),
      to: stop.toISOString(),
    };

    let cancelled = false;

    fetchEphemerisSample(range.from, range.to, 12)
      .then((sample) => {
        if (!cancelled) setData(sample);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      });

    return () => {
      cancelled = true;
    };
  }, [results]);

  return data;
}
