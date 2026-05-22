import type {
  CalculateRequest,
  Preset,
  TaskResponse,
  GridPointMetrics,
  VehicleProfile,
} from "../types";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Request failed");
  }
  return res.json();
}

export async function submitCalculation(body: CalculateRequest): Promise<{ task_id: string }> {
  return request("/api/v1/calculate", { method: "POST", body: JSON.stringify(body) });
}

export async function getTaskStatus(taskId: string): Promise<TaskResponse> {
  return request(`/api/v1/task/${taskId}`);
}

export async function previewTrajectory(
  origin: string,
  destination: string,
  departure: string,
  tof: number,
): Promise<GridPointMetrics> {
  const params = new URLSearchParams({ origin, destination, departure, tof: String(tof) });
  return request(`/api/v1/preview?${params}`);
}

export async function listPresets(): Promise<Preset[]> {
  return request("/api/v1/presets");
}

export async function listVehicles(): Promise<VehicleProfile[]> {
  return request("/api/v1/vehicles");
}

export function czmlUrl(relativePath: string): string {
  return `${API_BASE}${relativePath}`;
}
