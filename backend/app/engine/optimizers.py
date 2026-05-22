"""Route optimizers: fastest, cheapest, balanced."""

from datetime import datetime, timedelta, timezone

import numpy as np

from app.engine.mission import GridPoint


def _fallback_point(departure_dates, tof_days_list) -> GridPoint:
    return GridPoint(
        departure_epoch=departure_dates[0],
        arrival_epoch=departure_dates[0],
        tof_days=tof_days_list[0],
        delta_v_total=float("inf"),
        delta_v1=0,
        delta_v2=0,
        row=0,
        col=0,
    )


def _make_point(
    i: int,
    j: int,
    departure_dates: list,
    tof_days_list: list,
    dv_arr: np.ndarray,
    dv1_arr: np.ndarray,
    dv2_arr: np.ndarray,
) -> GridPoint:
    dep = departure_dates[i]
    tof = tof_days_list[j]
    return GridPoint(
        departure_epoch=dep,
        arrival_epoch=dep + timedelta(days=tof),
        tof_days=tof,
        delta_v_total=float(dv_arr[i, j]),
        delta_v1=float(dv1_arr[i, j]),
        delta_v2=float(dv2_arr[i, j]),
        row=i,
        col=j,
    )


def _nearest_departure_row(departure_dates: list, target: datetime) -> int:
    if target.tzinfo is None:
        target = target.replace(tzinfo=timezone.utc)
    deltas = [
        abs((d.replace(tzinfo=timezone.utc) if d.tzinfo is None else d) - target).total_seconds()
        for d in departure_dates
    ]
    return int(np.argmin(deltas))


def find_fastest_forward(
    departure_dates: list,
    tof_days_list: list,
    dv_matrix: list[list[float | None]],
    tof_matrix: list[list[float | None]],
    min_departure: datetime,
    dv1_matrix: list[list[float | None]] | None = None,
    dv2_matrix: list[list[float | None]] | None = None,
) -> GridPoint:
    """Minimum TOF among cells with departure >= min_departure; tie-break earlier departure."""
    dv_arr, tof_arr, valid, dv1_arr, dv2_arr = _build_arrays(
        dv_matrix, tof_matrix, dv1_matrix, dv2_matrix
    )
    if not valid.any():
        return _fallback_point(departure_dates, tof_days_list)

    if min_departure.tzinfo is None:
        min_departure = min_departure.replace(tzinfo=timezone.utc)

    best_i, best_j = None, None
    best_tof = np.inf
    best_dep_ts = np.inf

    for i, dep in enumerate(departure_dates):
        dep_utc = dep.replace(tzinfo=timezone.utc) if dep.tzinfo is None else dep
        if dep_utc < min_departure:
            continue
        for j in range(len(tof_days_list)):
            if not valid[i, j]:
                continue
            tof = float(tof_arr[i, j])
            dep_ts = dep_utc.timestamp()
            if tof < best_tof or (tof == best_tof and dep_ts < best_dep_ts):
                best_tof = tof
                best_dep_ts = dep_ts
                best_i, best_j = i, j

    if best_i is None:
        return _fallback_point(departure_dates, tof_days_list)
    return _make_point(best_i, best_j, departure_dates, tof_days_list, dv_arr, dv1_arr, dv2_arr)


def find_cheapest_at_departure(
    departure_dates: list,
    tof_days_list: list,
    dv_matrix: list[list[float | None]],
    tof_matrix: list[list[float | None]],
    target_departure: datetime,
    dv1_matrix: list[list[float | None]] | None = None,
    dv2_matrix: list[list[float | None]] | None = None,
) -> GridPoint:
    """Minimum delta-v along the grid row nearest to target_departure."""
    dv_arr, tof_arr, valid, dv1_arr, dv2_arr = _build_arrays(
        dv_matrix, tof_matrix, dv1_matrix, dv2_matrix
    )
    if not valid.any():
        return _fallback_point(departure_dates, tof_days_list)

    row = _nearest_departure_row(departure_dates, target_departure)
    row_valid = valid[row, :]
    if not row_valid.any():
        return _fallback_point(departure_dates, tof_days_list)

    dv_row = np.where(row_valid, dv_arr[row, :], np.inf)
    j = int(np.argmin(dv_row))
    return _make_point(row, j, departure_dates, tof_days_list, dv_arr, dv1_arr, dv2_arr)


def find_balanced_at_departure(
    departure_dates: list,
    tof_days_list: list,
    dv_matrix: list[list[float | None]],
    tof_matrix: list[list[float | None]],
    target_departure: datetime,
    weights: dict[str, float],
    dv1_matrix: list[list[float | None]] | None = None,
    dv2_matrix: list[list[float | None]] | None = None,
) -> GridPoint:
    """Weighted TOF + delta-v score on the row nearest to target_departure."""
    dv_arr, tof_arr, valid, dv1_arr, dv2_arr = _build_arrays(
        dv_matrix, tof_matrix, dv1_matrix, dv2_matrix
    )
    if not valid.any():
        return _fallback_point(departure_dates, tof_days_list)

    row = _nearest_departure_row(departure_dates, target_departure)
    row_valid = valid[row, :]
    if not row_valid.any():
        return _fallback_point(departure_dates, tof_days_list)

    w_t = weights.get("time", 0.5)
    w_dv = weights.get("delta_v", 0.5)
    valid_dv = dv_arr[valid]
    valid_tof = tof_arr[valid]
    dv_min, dv_max = valid_dv.min(), valid_dv.max()
    tof_min, tof_max = valid_tof.min(), valid_tof.max()

    dv_norm = (dv_arr[row, :] - dv_min) / (dv_max - dv_min + 1e-9)
    tof_norm = (tof_arr[row, :] - tof_min) / (tof_max - tof_min + 1e-9)
    score = w_t * tof_norm + w_dv * dv_norm
    score = np.where(row_valid, score, np.inf)
    j = int(np.argmin(score))
    return _make_point(row, j, departure_dates, tof_days_list, dv_arr, dv1_arr, dv2_arr)


def _build_arrays(
    dv_matrix: list[list[float | None]],
    tof_matrix: list[list[float | None]],
    dv1_matrix: list[list[float | None]] | None = None,
    dv2_matrix: list[list[float | None]] | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    dv_arr = np.array([[v if v is not None else np.nan for v in row] for row in dv_matrix])
    tof_arr = np.array([[v if v is not None else np.nan for v in row] for row in tof_matrix])
    valid = ~np.isnan(dv_arr)

    if dv1_matrix is not None and dv2_matrix is not None:
        dv1_arr = np.array([[v if v is not None else np.nan for v in row] for row in dv1_matrix])
        dv2_arr = np.array([[v if v is not None else np.nan for v in row] for row in dv2_matrix])
    else:
        dv1_arr = dv_arr / 2.0
        dv2_arr = dv_arr / 2.0

    return dv_arr, tof_arr, valid, dv1_arr, dv2_arr


def find_optima(
    departure_dates,
    tof_days_list,
    dv_matrix: list[list[float | None]],
    tof_matrix: list[list[float | None]],
    weights: dict[str, float],
    reference_departure: datetime | None = None,
    dv1_matrix: list[list[float | None]] | None = None,
    dv2_matrix: list[list[float | None]] | None = None,
) -> tuple[GridPoint, GridPoint, GridPoint]:
    """Compute fastest (forward), cheapest and balanced at reference departure."""
    ref = reference_departure or departure_dates[0]
    fastest = find_fastest_forward(
        departure_dates, tof_days_list, dv_matrix, tof_matrix, ref, dv1_matrix, dv2_matrix
    )
    cheapest = find_cheapest_at_departure(
        departure_dates, tof_days_list, dv_matrix, tof_matrix, ref, dv1_matrix, dv2_matrix
    )
    balanced = find_balanced_at_departure(
        departure_dates, tof_days_list, dv_matrix, tof_matrix, ref, weights, dv1_matrix, dv2_matrix
    )
    return fastest, cheapest, balanced
