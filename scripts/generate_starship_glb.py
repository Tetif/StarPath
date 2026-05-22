"""Generate a low-poly Starship-like GLB for StarPath (CC0, project-owned)."""
from __future__ import annotations

import json
import struct
from pathlib import Path

import numpy as np
import trimesh

OUT = Path(__file__).resolve().parents[1] / "frontend" / "public" / "models" / "starship.glb"

# Real Starship ~50 m tall; model uses meters, +Y = flight axis, origin at base.
HEIGHT = 50.0
BODY_H = 38.0
BODY_R = 4.5
NOSE_H = 12.0
FIN_W = 3.0
FIN_H = 8.0
FIN_T = 0.6


def _cylinder(radius: float, height: float, sections: int = 24) -> trimesh.Trimesh:
    return trimesh.creation.cylinder(radius=radius, height=height, sections=sections)


def _cone(radius: float, height: float, sections: int = 24) -> trimesh.Trimesh:
    return trimesh.creation.cone(radius=radius, height=height, sections=sections)


def _fin() -> trimesh.Trimesh:
    return trimesh.creation.box(extents=[FIN_W, FIN_H, FIN_T])


def build_starship() -> trimesh.Trimesh:
    body = _cylinder(BODY_R, BODY_H)
    body.apply_translation([0, BODY_H / 2, 0])

    nose = _cone(BODY_R * 0.85, NOSE_H)
    nose.apply_translation([0, BODY_H + NOSE_H / 2, 0])

    parts = [body, nose]
    fin_y = BODY_H * 0.22
    for angle in (0, 90, 180, 270):
        fin = _fin()
        fin.apply_translation([BODY_R + FIN_W / 2, fin_y, 0])
        fin.apply_transform(trimesh.transformations.rotation_matrix(np.radians(angle), [0, 1, 0]))
        parts.append(fin)

    mesh = trimesh.util.concatenate(parts)
    mesh.merge_vertices()
    mesh.remove_unreferenced_vertices()
    return mesh


def main() -> None:
    mesh = build_starship()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    mesh.export(OUT, file_type="glb")
    print(f"Wrote {OUT} ({OUT.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
