import { Html } from "@react-three/drei";

import { useFrame } from "@react-three/fiber";

import { useRef } from "react";

import * as THREE from "three";

import { getPlanetLabelOcclusionFactor } from "../../lib/labelPlanetOcclusion";
import { getPlaybackControlsOcclusionFactor } from "../../lib/overlayOcclusion";
import type { BodyId } from "../../types";



interface BodyLabelProps {

  name: string;

  bodyRadius: number;

  offset?: number;

  small?: boolean;

  /** Always show label regardless of angular size (e.g. Sun). */

  persistent?: boolean;

  /** Dim label when it overlaps this planet's on-screen disc (moon labels). */
  occludedBy?: BodyId;

  onClick?: () => void;

}



const MIN_PX = { planet: 10, moon: 9 };

const MAX_PX = { planet: 15, moon: 12 };

const BASE_PX = { planet: 13, moon: 10 };

const Z_INDEX: Record<"sun" | "planet" | "moon", [number, number]> = {

  sun: [140, 120],

  planet: [100, 80],

  moon: [50, 30],

};

const DEFAULT_OFFSET = { sun: 1.3, planet: 1.6, moon: 0.85 };



export default function BodyLabel({

  name,

  bodyRadius,

  offset,

  small = false,

  persistent = false,

  occludedBy,

  onClick,

}: BodyLabelProps) {

  const tier = persistent ? "sun" : small ? "moon" : "planet";

  const labelOffset = offset ?? DEFAULT_OFFSET[tier];

  const zIndexRange = Z_INDEX[tier];

  const groupRef = useRef<THREE.Group>(null);

  const labelRef = useRef<HTMLDivElement>(null);

  const maxDistance = persistent ? 5e14 : 5e12;

  const minPx = small ? MIN_PX.moon : MIN_PX.planet;

  const maxPx = small ? MAX_PX.moon : MAX_PX.planet;

  const basePx = small ? BASE_PX.moon : BASE_PX.planet;



  useFrame(({ camera }, _delta, frame) => {

    if (!groupRef.current || !labelRef.current) return;



    const world = new THREE.Vector3();

    groupRef.current.getWorldPosition(world);

    const dist = camera.position.distanceTo(world);



    if (dist > maxDistance || bodyRadius <= 0) {

      labelRef.current.style.opacity = "0";

      labelRef.current.style.visibility = "hidden";

      return;

    }



    const angularRadius = bodyRadius / Math.max(dist, 1);

    const minAngle = 4e-9;

    if (!persistent && angularRadius < minAngle) {

      labelRef.current.style.opacity = "0";

      labelRef.current.style.visibility = "hidden";

      return;

    }



    const proximity = 1 - dist / maxDistance;

    const px = THREE.MathUtils.clamp(

      basePx + proximity * (maxPx - basePx) * 0.45,

      minPx,

      maxPx,

    );



    labelRef.current.style.fontSize = `${px}px`;

    const baseOpacity = THREE.MathUtils.clamp(0.55 + proximity * 0.45, 0.55, 1);
    const playbackOcclusion = getPlaybackControlsOcclusionFactor(labelRef.current, frame);
    const planetOcclusion = occludedBy
      ? getPlanetLabelOcclusionFactor(labelRef.current, dist, occludedBy, frame)
      : 1;
    labelRef.current.style.opacity = String(baseOpacity * playbackOcclusion * planetOcclusion);

    labelRef.current.style.visibility = "visible";

  });



  return (

    <group ref={groupRef} position={[0, bodyRadius * labelOffset, 0]}>

      <Html

        center

        transform={false}

        zIndexRange={zIndexRange}

        style={{ pointerEvents: onClick ? "auto" : "none", userSelect: "none" }}

      >

        <div

          ref={labelRef}

          role={onClick ? "button" : undefined}

          tabIndex={onClick ? 0 : undefined}

          onClick={

            onClick

              ? (e) => {

                  e.stopPropagation();

                  onClick();

                }

              : undefined

          }

          onKeyDown={

            onClick

              ? (e) => {

                  if (e.key === "Enter" || e.key === " ") {

                    e.preventDefault();

                    e.stopPropagation();

                    onClick();

                  }

                }

              : undefined

          }

          style={{

            color: "#FFFFFF",

            fontSize: `${basePx}px`,

            fontFamily: "'Segoe UI', system-ui, sans-serif",

            fontWeight: small ? 500 : 600,

            textShadow: "0 0 3px #000, 0 0 8px #000",

            whiteSpace: "nowrap",

            letterSpacing: "0.02em",

            lineHeight: 1.1,

            transform: "translate(-50%, -100%)",

            maxWidth: "120px",

            overflow: "hidden",

            textOverflow: "ellipsis",

            textAlign: "center",

            cursor: onClick ? "pointer" : undefined,

          }}

        >

          {name}

        </div>

      </Html>

    </group>

  );

}


