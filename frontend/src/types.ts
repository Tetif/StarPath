export type BodyId =
  | "sun"
  | "mercury"
  | "venus"
  | "earth"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptune"
  | "moon";

export type VehicleId = "starship" | "none";

export type CalculationMode = "fast" | "accurate";

export interface VehicleProfile {
  id: VehicleId;
  name: string;
  description: string;
  max_delta_v_total_km_s: number;
  max_delta_v_departure_km_s: number;
  max_delta_v_arrival_km_s: number;
  theoretical_max_delta_v_km_s?: number | null;
}

export interface CalculateRequest {
  origin: BodyId;
  destination: BodyId;
  departure_from: string;
  allow_gravity_assist?: boolean;
  use_barycenter?: boolean;
  vehicle_id?: VehicleId;
  calculation_mode?: CalculationMode;
  weights?: { time: number; delta_v: number };
}

export interface GridPointMetrics {
  departure_epoch: string;
  arrival_epoch: string;
  tof_days: number;
  delta_v_total: number;
  delta_v1: number;
  delta_v2: number;
}

export interface LegMetric {
  from_body: string;
  to_body: string;
  dv_departure: number;
  dv_arrival: number;
}

export interface TrajectoryResult {
  metrics: GridPointMetrics;
  czml_url: string;
  soi_transitions?: Array<{ epoch: string; from_body: string; to_body: string }>;
  assist_bodies?: string[];
  leg_metrics?: LegMetric[];
}

export interface PorkchopData {
  departure_epochs: string[];
  tof_days: number[];
  delta_v: (number | null)[][];
}

export interface TaskResults {
  launch_window?: {
    synodic_period_days?: number;
    optimal_departure?: string;
    reference_departure?: string;
    search_horizon_days?: number;
    next_window_start?: string;
    warning?: string | null;
    feasible_cells_fraction?: number;
    vehicle?: {
      vehicle_id: string;
      vehicle_name: string;
      max_delta_v_total_km_s: number;
      max_delta_v_departure_km_s: number;
      max_delta_v_arrival_km_s: number;
      theoretical_max_delta_v_km_s?: number | null;
    };
  };
  porkchop?: PorkchopData;
  trajectories?: Record<string, TrajectoryResult>;
}

export interface TaskResponse {
  status: "pending" | "running" | "completed" | "failed";
  progress: number;
  stage?: string | null;
  error?: string | null;
  results?: TaskResults | null;
}

export interface Preset {
  id: string;
  name: string;
  description: string;
  origin: BodyId;
  destination: BodyId;
  departure_from: string;
  allow_gravity_assist: boolean;
  historical_note: string;
}

export type TrajectoryKind = "fastest" | "cheapest" | "balanced";
