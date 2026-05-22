import { useCallback, useEffect, useRef, useState } from "react";
import { getTaskStatus, submitCalculation } from "../lib/api";
import type { CalculateRequest, TaskResponse } from "../types";

const POLL_INTERVAL_MS = 300;

export function useTaskPolling() {
  const [taskId, setTaskId] = useState<string | null>(null);
  const [status, setStatus] = useState<TaskResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const poll = useCallback(
    async (id: string) => {
      try {
        const res = await getTaskStatus(id);
        setStatus(res);
        if (res.status === "completed" || res.status === "failed") {
          stopPolling();
          setLoading(false);
          if (res.status === "failed") {
            setError(res.error || "Calculation failed");
          }
        }
      } catch (e) {
        stopPolling();
        setLoading(false);
        setError(e instanceof Error ? e.message : "Polling failed");
      }
    },
    [stopPolling],
  );

  const calculate = useCallback(
    async (request: CalculateRequest) => {
      setLoading(true);
      setError(null);
      setStatus({
        status: "pending",
        progress: 0,
        stage: "Submitting mission...",
        error: null,
        results: null,
      });
      stopPolling();
      try {
        const { task_id } = await submitCalculation(request);
        setTaskId(task_id);
        intervalRef.current = window.setInterval(() => poll(task_id), POLL_INTERVAL_MS);
        await poll(task_id);
      } catch (e) {
        setLoading(false);
        setError(e instanceof Error ? e.message : "Submit failed");
      }
    },
    [poll, stopPolling],
  );

  useEffect(() => () => stopPolling(), [stopPolling]);

  return { taskId, status, loading, error, calculate };
}
