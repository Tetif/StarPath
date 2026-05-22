import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame, useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { MOON_VISUALS, PLANET_VISUALS, SKY_TEXTURE_URL } from "./planetAssets";

const textureCache = new Map<string, THREE.Texture>();
const inflightLoads = new Map<string, Promise<THREE.Texture>>();

const SURFACE_TEXTURE_URLS = Array.from(
  new Set([
    SKY_TEXTURE_URL,
    ...Object.values(PLANET_VISUALS).map((visual) => visual.textureUrl),
    ...Object.values(MOON_VISUALS).map((visual) => visual.textureUrl),
  ]),
);

let preloaded = false;

export function preloadSurfaceTextures(): void {
  if (preloaded) return;
  preloaded = true;
  for (const url of SURFACE_TEXTURE_URLS) {
    useLoader.preload(THREE.TextureLoader, url);
  }
}

function configureSurfaceTexture(texture: THREE.Texture): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
}

function uploadTexture(gl: THREE.WebGLRenderer, texture: THREE.Texture): void {
  if ("initTexture" in gl) {
    (gl as THREE.WebGLRenderer & { initTexture: (tex: THREE.Texture) => void }).initTexture(texture);
  }
}

function isTextureReady(texture: THREE.Texture | null): texture is THREE.Texture {
  if (!texture?.image) return false;
  const image = texture.image as HTMLImageElement | { width?: number };
  if ("complete" in image) {
    return image.complete && image.naturalWidth > 0;
  }
  return (image.width ?? 0) > 0;
}

function loadTexture(url: string): Promise<THREE.Texture> {
  const cached = textureCache.get(url);
  if (cached) return Promise.resolve(cached);

  const pending = inflightLoads.get(url);
  if (pending) return pending;

  const promise = new Promise<THREE.Texture>((resolve, reject) => {
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    loader.load(
      url,
      (loaded) => {
        configureSurfaceTexture(loaded);
        textureCache.set(url, loaded);
        inflightLoads.delete(url);
        resolve(loaded);
      },
      undefined,
      (error) => {
        inflightLoads.delete(url);
        reject(error);
      },
    );
  });

  inflightLoads.set(url, promise);
  return promise;
}

export function useOptionalTexture(url: string | undefined): THREE.Texture | null {
  const gl = useThree((state) => state.gl);
  const [texture, setTexture] = useState<THREE.Texture | null>(() =>
    url ? (textureCache.get(url) ?? null) : null,
  );

  useEffect(() => {
    if (!url) {
      setTexture(null);
      return;
    }

    const cached = textureCache.get(url);
    if (cached) {
      uploadTexture(gl, cached);
      setTexture(cached);
      return;
    }

    let cancelled = false;
    loadTexture(url)
      .then((loaded) => {
        if (cancelled) return;
        uploadTexture(gl, loaded);
        setTexture(loaded);
      })
      .catch(() => {
        if (!cancelled) setTexture(null);
      });

    return () => {
      cancelled = true;
    };
  }, [url, gl]);

  return texture;
}

const unlitSurfaceVertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const unlitSurfaceFragmentShader = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 color;
  uniform float hasMap;

  varying vec2 vUv;

  void main() {
    vec3 albedo = hasMap > 0.5 ? texture2D(map, vUv).rgb * color : color;
    gl_FragColor = vec4(albedo, 1.0);
  }
`;

const litSurfaceVertexShader = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vNormalWorld;

  void main() {
    vUv = uv;
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const litSurfaceFragmentShader = /* glsl */ `
  uniform sampler2D map;
  uniform vec3 color;
  uniform vec3 sunDirection;
  uniform float ambient;
  uniform float hasMap;

  varying vec2 vUv;
  varying vec3 vNormalWorld;

  void main() {
    vec3 albedo = hasMap > 0.5 ? texture2D(map, vUv).rgb * color : color;
    float ndl = dot(normalize(vNormalWorld), normalize(sunDirection));
    float light = ambient + (1.0 - ambient) * smoothstep(-0.12, 0.18, ndl);
    gl_FragColor = vec4(albedo * light, 1.0);
  }
`;

/** Default ambient for planets — keeps night side readable. */
export const PLANET_LIGHT_AMBIENT = 0.42;
/** Slightly brighter fill for small moons. */
export const MOON_LIGHT_AMBIENT = 0.52;

interface SunSurfaceMaterialProps {
  textureUrl?: string;
  fallbackColor: string;
}

/** Full-brightness unlit material for the Sun (no day/night shading). */
export function SunSurfaceMaterial({ textureUrl, fallbackColor }: SunSurfaceMaterialProps) {
  const map = useOptionalTexture(textureUrl);
  const ready = isTextureReady(map);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      map: { value: null as THREE.Texture | null },
      color: { value: new THREE.Color("#ffffff") },
      hasMap: { value: 0 },
    }),
    [],
  );

  useEffect(() => {
    if (ready) {
      uniforms.map.value = map;
      uniforms.hasMap.value = 1;
      uniforms.color.value.set("#ffffff");
      return;
    }

    uniforms.map.value = null;
    uniforms.hasMap.value = 0;
    uniforms.color.value.set(fallbackColor);
  }, [ready, map, fallbackColor, uniforms]);

  return (
    <shaderMaterial
      ref={materialRef}
      uniforms={uniforms}
      vertexShader={unlitSurfaceVertexShader}
      fragmentShader={unlitSurfaceFragmentShader}
      toneMapped={false}
      fog={false}
    />
  );
}

interface LitPlanetSurfaceMaterialProps {
  textureUrl?: string;
  fallbackColor: string;
  sunDirectionRef: RefObject<THREE.Vector3>;
  /** Multiply texture color (shared moon maps). */
  tint?: string;
  ambient?: number;
}

export function LitPlanetSurfaceMaterial({
  textureUrl,
  fallbackColor,
  sunDirectionRef,
  tint,
  ambient = PLANET_LIGHT_AMBIENT,
}: LitPlanetSurfaceMaterialProps) {
  const map = useOptionalTexture(textureUrl);
  const ready = isTextureReady(map);
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      map: { value: null as THREE.Texture | null },
      color: { value: new THREE.Color(tint ?? "#ffffff") },
      sunDirection: { value: new THREE.Vector3(0, 1, 0) },
      ambient: { value: ambient },
      hasMap: { value: 0 },
    }),
    [ambient, tint],
  );

  useEffect(() => {
    if (ready) {
      uniforms.map.value = map;
      uniforms.hasMap.value = 1;
      uniforms.color.value.set(tint ?? "#ffffff");
      return;
    }

    uniforms.map.value = null;
    uniforms.hasMap.value = 0;
    uniforms.color.value.set(fallbackColor);
  }, [ready, map, fallbackColor, tint, uniforms]);

  useFrame(() => {
    const material = materialRef.current;
    const sunDirection = sunDirectionRef.current;
    if (!material || !sunDirection) return;
    material.uniforms.sunDirection.value.copy(sunDirection);
  });

  return (
    <shaderMaterial
      ref={materialRef}
      uniforms={uniforms}
      vertexShader={litSurfaceVertexShader}
      fragmentShader={litSurfaceFragmentShader}
      toneMapped={false}
      fog={false}
    />
  );
}

interface PlanetSurfaceMaterialProps {
  textureUrl?: string;
  fallbackColor: string;
  /** Multiply texture color (shared moon maps). */
  tint?: string;
}

export function PlanetSurfaceMaterial({
  textureUrl,
  fallbackColor,
  tint,
}: PlanetSurfaceMaterialProps) {
  const map = useOptionalTexture(textureUrl);
  const ready = isTextureReady(map);

  return (
    <meshBasicMaterial
      map={ready ? map : null}
      color={ready ? (tint ?? "#ffffff") : fallbackColor}
      toneMapped={false}
      fog={false}
    />
  );
}
