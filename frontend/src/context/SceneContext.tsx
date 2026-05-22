import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type MutableRefObject,
} from "react";
import * as THREE from "three";

import type { BodyId, TaskResults, TrajectoryKind, VehicleId } from "../types";
import type { EphemerisData } from "../lib/ephemeris";
import { getEphemerisTimeRange } from "../lib/ephemeris";
import { getDefaultSimulationRange } from "../lib/time";
import {
  collectTrajectoryPoints,
  fetchTrajectory,
  getCraftPosition,
  getCraftState,
  mergeTimeRanges,
  type CraftState,
  type ParsedTrajectory,
} from "../lib/czmlParser";
import { resolveBodyPosition } from "../hooks/usePlanetPositions";
import {
  getBodyFocusStandoff,
  getSolarSystemOverviewDistance,
} from "../lib/scaleMode";
import { boundingSphereFromPoints, flyToCameraPosition } from "../lib/vectors";

export interface CameraController {
  flyToTarget: (target: THREE.Vector3, distance: number, duration?: number) => void;
  flyApproachTarget: (
    target: THREE.Vector3,
    standoff: { minStandoff: number; preferredView: number },
    duration?: number,
  ) => void;
  flyToPoints: (points: THREE.Vector3[], duration?: number) => void;
  flyToPlanet: (bodyId: BodyId) => void;
  flyToBody: (bodyId: string) => void;
  zoom: (direction: "in" | "out") => void;
  setTarget: (target: THREE.Vector3) => void;
  getTarget: () => THREE.Vector3;
  snapCraftChase: (state: CraftState) => void;
}

export interface SceneContextValue {
  origin: BodyId | null;
  destination: BodyId | null;
  ephemeris: EphemerisData | null;
  currentTime: Date;
  currentTimeRef: MutableRefObject<Date>;
  playing: boolean;
  multiplier: number;
  trajectories: Record<TrajectoryKind, ParsedTrajectory | null>;
  trajectoriesLoading: boolean;
  visibleTrajectories: Record<TrajectoryKind, boolean>;
  chaseKind: TrajectoryKind | null;
  focusedBodyIdRef: MutableRefObject<string | null>;
  floatingOriginRef: MutableRefObject<THREE.Vector3>;
  setFloatingOrigin: (origin: THREE.Vector3) => void;
  setPlaying: (playing: boolean) => void;
  setMultiplier: (multiplier: number) => void;
  setCurrentTime: (time: Date) => void;
  clockStart: Date;
  clockStop: Date;
  ephemerisRange: { start: Date; stop: Date } | null;
  setClockRange: (start: Date, stop: Date) => void;
  syncCurrentTimeToUi: (time: Date) => void;
  setChaseKind: (kind: TrajectoryKind | null) => void;
  selectTrajectory: (kind: TrajectoryKind) => void;
  syncClockToTrajectories: () => boolean;
  startFlightDemo: (kind?: TrajectoryKind) => void;
  snapCraftChaseForKind: (kind: TrajectoryKind) => void;
  focusOnStarship: (kind?: TrajectoryKind) => void;
  hasStarshipAtCurrentTime: boolean;
  flyToPlanet: (bodyId: BodyId) => void;
  flyToBody: (bodyId: string) => void;
  flyToTransferView: () => void;
  flyToSolarSystemOverview: () => void;
  flyToTrajectories: (duration?: number) => void;
  zoom: (direction: "in" | "out") => void;
  getCraftPosition: (kind: TrajectoryKind) => THREE.Vector3 | null;
  getCraftState: (kind: TrajectoryKind) => CraftState | null;
  vehicleId: VehicleId;
  activeKind: TrajectoryKind;
  registerCamera: (controller: CameraController) => void;
  unregisterCamera: () => void;
}

const SceneContext = createContext<SceneContextValue | null>(null);

export function useScene(): SceneContextValue {
  const ctx = useContext(SceneContext);
  if (!ctx) throw new Error("useScene must be used within SceneProvider");
  return ctx;
}

interface SceneProviderProps {
  origin: BodyId | null;
  destination: BodyId | null;
  ephemeris: EphemerisData | null;
  results: TaskResults | null;
  taskId: string | null;
  visibleTrajectories: Record<TrajectoryKind, boolean>;
  activeKind: TrajectoryKind;
  onTrajectorySelect?: (kind: TrajectoryKind) => void;
  children: ReactNode;
}

const EMPTY_TRAJECTORIES: Record<TrajectoryKind, ParsedTrajectory | null> = {
  fastest: null,
  cheapest: null,
  balanced: null,
};

const TRAJECTORY_KINDS: TrajectoryKind[] = ["fastest", "cheapest", "balanced"];

export function SceneProvider({
  origin,
  destination,
  ephemeris,
  results,
  taskId,
  visibleTrajectories,
  activeKind,
  onTrajectorySelect,
  children,
}: SceneProviderProps) {
  const [trajectories, setTrajectories] =
    useState<Record<TrajectoryKind, ParsedTrajectory | null>>(EMPTY_TRAJECTORIES);
  const [trajectoriesLoading, setTrajectoriesLoading] = useState(false);
  const defaultRange = useMemo(() => getDefaultSimulationRange(), []);
  const [currentTime, setCurrentTimeState] = useState(() => defaultRange.current);
  const currentTimeRef = useRef(currentTime);
  const [clockStart, setClockStart] = useState(() => defaultRange.start);
  const [clockStop, setClockStop] = useState(() => defaultRange.stop);
  const [playing, setPlaying] = useState(false);
  const [multiplier, setMultiplier] = useState(10_000);
  const [chaseKind, setChaseKindState] = useState<TrajectoryKind | null>(null);
  const focusedBodyIdRef = useRef<string | null>(null);
  const floatingOriginRef = useRef(new THREE.Vector3());
  const cameraRef = useRef<CameraController | null>(null);
  const loadedTaskRef = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);

  const setFloatingOrigin = useCallback((origin: THREE.Vector3) => {
    floatingOriginRef.current.copy(origin);
  }, []);

  const clearFocusedBody = useCallback(() => {
    focusedBodyIdRef.current = null;
  }, []);

  const setChaseKind = useCallback((kind: TrajectoryKind | null) => {
    if (kind) clearFocusedBody();
    setChaseKindState(kind);
  }, [clearFocusedBody]);

  const setCurrentTime = useCallback((time: Date) => {
    currentTimeRef.current = time;
    setCurrentTimeState(time);
  }, []);

  const syncCurrentTimeToUi = useCallback((time: Date) => {
    setCurrentTimeState(time);
  }, []);

  const setClockRange = useCallback((start: Date, stop: Date) => {
    setClockStart(start);
    setClockStop(stop);
  }, []);

  const registerCamera = useCallback((controller: CameraController) => {
    cameraRef.current = controller;
  }, []);

  const unregisterCamera = useCallback(() => {
    cameraRef.current = null;
  }, []);

  const getCraftPos = useCallback(
    (kind: TrajectoryKind): THREE.Vector3 | null => {
      const traj = trajectories[kind];
      if (!traj || !visibleTrajectories[kind]) return null;
      return getCraftPosition(traj, currentTimeRef.current);
    },
    [trajectories, visibleTrajectories],
  );

  const getCraftStateForKind = useCallback(
    (kind: TrajectoryKind): CraftState | null => {
      const traj = trajectories[kind];
      if (!traj || !visibleTrajectories[kind]) return null;
      return getCraftState(traj, currentTimeRef.current);
    },
    [trajectories, visibleTrajectories],
  );

  const vehicleId = (results?.launch_window?.vehicle?.vehicle_id ?? "starship") as VehicleId;

  const flyToPoints = useCallback((points: THREE.Vector3[], duration = 1.5) => {
    cameraRef.current?.flyToPoints(points, duration);
  }, []);

  const focusBody = useCallback(
    (bodyId: string, duration = 1.2) => {
      focusedBodyIdRef.current = bodyId;
      const pos = resolveBodyPosition(bodyId, currentTimeRef.current, ephemeris);
      const { preferredView } = getBodyFocusStandoff(bodyId);
      cameraRef.current?.flyToTarget(pos, preferredView, duration);
    },
    [ephemeris],
  );

  const flyToPlanet = useCallback(
    (bodyId: BodyId) => {
      focusBody(bodyId);
    },
    [focusBody],
  );

  const flyToBody = useCallback(
    (bodyId: string) => {
      focusBody(bodyId);
    },
    [focusBody],
  );

  const prevOriginRef = useRef(origin);
  const prevDestinationRef = useRef(destination);

  useEffect(() => {
    if (origin !== prevOriginRef.current) {
      prevOriginRef.current = origin;
      if (origin) focusBody(origin);
    }
  }, [origin, focusBody]);

  useEffect(() => {
    if (destination !== prevDestinationRef.current) {
      prevDestinationRef.current = destination;
      if (destination) focusBody(destination);
    }
  }, [destination, focusBody]);

  const flyToTransferView = useCallback(() => {
    if (!origin || !destination) return;
    clearFocusedBody();
    const originPos = resolveBodyPosition(origin, currentTimeRef.current, ephemeris);
    const destPos = resolveBodyPosition(destination, currentTimeRef.current, ephemeris);
    const { center, radius } = boundingSphereFromPoints(
      [originPos, destPos, new THREE.Vector3()],
    );
    const distance = Math.max(radius * 2.8, getBodyFocusStandoff(origin).preferredView * 2);
    cameraRef.current?.flyToTarget(center, distance, 1.5);
  }, [origin, destination, ephemeris, clearFocusedBody]);

  const flyToSolarSystemOverview = useCallback(() => {
    clearFocusedBody();
    const distance = getSolarSystemOverviewDistance();
    cameraRef.current?.flyToTarget(new THREE.Vector3(0, 0, 0), distance, 1.8);
  }, [clearFocusedBody]);

  const flyToTrajectories = useCallback(
    (duration = 1.5) => {
      clearFocusedBody();
      const points = collectTrajectoryPoints(trajectories, visibleTrajectories);
      if (points.length > 0) flyToPoints(points, duration);
    },
    [trajectories, visibleTrajectories, flyToPoints, clearFocusedBody],
  );

  const syncClockToTrajectories = useCallback((): boolean => {
    const visible = (Object.keys(trajectories) as TrajectoryKind[])
      .filter((k) => visibleTrajectories[k] && trajectories[k])
      .map((k) => trajectories[k]!);

    const range = mergeTimeRanges(visible);
    if (!range) return false;

    setClockStart(range.start);
    setClockStop(range.stop);
    setCurrentTime(range.start);
    return true;
  }, [trajectories, visibleTrajectories, setCurrentTime]);

  const snapCraftChaseForKind = useCallback(
    (kind: TrajectoryKind) => {
      const state = getCraftStateForKind(kind);
      if (state) cameraRef.current?.snapCraftChase(state);
    },
    [getCraftStateForKind],
  );

  const focusOnStarship = useCallback(
    (kind: TrajectoryKind = activeKind) => {
      if (vehicleId !== "starship") return;
      const state = getCraftStateForKind(kind);
      if (!state) return;
      setChaseKind(kind);
      snapCraftChaseForKind(kind);
    },
    [activeKind, vehicleId, getCraftStateForKind, snapCraftChaseForKind],
  );

  const selectTrajectory = useCallback(
    (kind: TrajectoryKind) => {
      if (!trajectories[kind] || !visibleTrajectories[kind]) return;
      onTrajectorySelect?.(kind);
      setChaseKind(kind);
      snapCraftChaseForKind(kind);
    },
    [
      trajectories,
      visibleTrajectories,
      onTrajectorySelect,
      snapCraftChaseForKind,
    ],
  );

  const hasStarshipAtCurrentTime = useMemo(() => {
    if (vehicleId !== "starship") return false;
    return getCraftStateForKind(activeKind) !== null;
  }, [vehicleId, activeKind, getCraftStateForKind, currentTime, trajectories, visibleTrajectories]);

  const startFlightDemo = useCallback(
    (kind: TrajectoryKind = "balanced") => {
      if (!syncClockToTrajectories()) return;
      setMultiplier(50000);
      setChaseKind(kind);
      snapCraftChaseForKind(kind);
      setPlaying(true);
    },
    [syncClockToTrajectories, snapCraftChaseForKind],
  );

  const zoom = useCallback((direction: "in" | "out") => {
    cameraRef.current?.zoom(direction);
  }, []);

  useEffect(() => {
    if (!results?.trajectories) {
      setTrajectories(EMPTY_TRAJECTORIES);
      setTrajectoriesLoading(false);
      loadedTaskRef.current = null;
      return;
    }

    const loadKey =
      taskId ??
      JSON.stringify(
        Object.entries(results.trajectories).map(([k, v]) => [k, v.czml_url]),
      );

    if (loadedTaskRef.current === loadKey) return;

    const generation = ++loadGenerationRef.current;
    let cancelled = false;
    setTrajectoriesLoading(true);
    setTrajectories(EMPTY_TRAJECTORIES);

    (async () => {
      try {
        const next: Record<TrajectoryKind, ParsedTrajectory | null> = { ...EMPTY_TRAJECTORIES };

        for (const kind of TRAJECTORY_KINDS) {
          if (cancelled) return;
          const traj = results.trajectories?.[kind];
          if (!traj) continue;
          try {
            next[kind] = await fetchTrajectory(traj.czml_url, kind);
          } catch (err) {
            console.error(`Failed to load ${kind} trajectory:`, err);
          }
        }

        if (cancelled || loadGenerationRef.current !== generation) return;

        loadedTaskRef.current = loadKey;
        setTrajectories(next);

        const visible = (Object.keys(next) as TrajectoryKind[])
          .filter((k) => visibleTrajectories[k] && next[k])
          .map((k) => next[k]!);
        const range = mergeTimeRanges(visible);
        if (range) {
          setClockStart((prev) => new Date(Math.min(prev.getTime(), range.start.getTime())));
          setClockStop((prev) => new Date(Math.max(prev.getTime(), range.stop.getTime())));
          setCurrentTime(range.start);
          setPlaying(false);
        }
      } finally {
        if (loadGenerationRef.current === generation) {
          setTrajectoriesLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [results, taskId, setCurrentTime]);

  const ephemerisRange = useMemo(
    () => (ephemeris ? getEphemerisTimeRange(ephemeris) : null),
    [ephemeris],
  );

  useEffect(() => {
    if (!results?.trajectories) return;
    if (origin && destination) {
      const t = setTimeout(() => flyToTransferView(), 100);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => flyToTrajectories(), 100);
    return () => clearTimeout(t);
  }, [results, trajectories, origin, destination, flyToTransferView, flyToTrajectories]);

  const value = useMemo<SceneContextValue>(
    () => ({
      origin,
      destination,
      ephemeris,
      currentTime,
      currentTimeRef,
      playing,
      multiplier,
      trajectories,
      trajectoriesLoading,
      visibleTrajectories,
      chaseKind,
      focusedBodyIdRef,
      floatingOriginRef,
      setFloatingOrigin,
      setPlaying,
      setMultiplier,
      setCurrentTime,
      clockStart,
      clockStop,
      ephemerisRange,
      setClockRange,
      syncCurrentTimeToUi,
      setChaseKind,
      selectTrajectory,
      syncClockToTrajectories,
      startFlightDemo,
      snapCraftChaseForKind,
      focusOnStarship,
      hasStarshipAtCurrentTime,
      flyToPlanet,
      flyToBody,
      flyToTransferView,
      flyToSolarSystemOverview,
      flyToTrajectories,
      zoom,
      getCraftPosition: getCraftPos,
      getCraftState: getCraftStateForKind,
      vehicleId,
      activeKind,
      registerCamera,
      unregisterCamera,
    }),
    [
      origin,
      destination,
      ephemeris,
      currentTime,
      playing,
      multiplier,
      trajectories,
      trajectoriesLoading,
      visibleTrajectories,
      chaseKind,
      focusedBodyIdRef,
      clockStart,
      clockStop,
      ephemerisRange,
      setFloatingOrigin,
      setCurrentTime,
      setClockRange,
      syncCurrentTimeToUi,
      selectTrajectory,
      syncClockToTrajectories,
      startFlightDemo,
      snapCraftChaseForKind,
      focusOnStarship,
      hasStarshipAtCurrentTime,
      flyToPlanet,
      flyToBody,
      flyToTransferView,
      flyToSolarSystemOverview,
      flyToTrajectories,
      zoom,
      getCraftPos,
      getCraftStateForKind,
      vehicleId,
      activeKind,
      registerCamera,
      unregisterCamera,
    ],
  );

  return <SceneContext.Provider value={value}>{children}</SceneContext.Provider>;
}

/** Re-provide scene context inside R3F Canvas (context does not cross Canvas boundary). */
export function SceneContextBridge({
  value,
  children,
}: {
  value: SceneContextValue;
  children: ReactNode;
}) {
  return <SceneContext.Provider value={value}>{children}</SceneContext.Provider>;
}

export { boundingSphereFromPoints, flyToCameraPosition };
